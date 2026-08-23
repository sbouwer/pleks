/**
 * lib/auth/server.ts — Cached per-request server auth helpers
 *
 * getServerUser()             — GoTrue-verified user (not cookie-spoofable; one round-trip per render tree)
 * getServerOrgMembership()    — org_id + role, resolved by gateway's resolveOrgMembership (cookie
 *                               CHOOSES the org, user_orgs AUTHORISES it). No tier — see below.
 * getCurrentOrgCapabilities() — OrgCapabilities for the current org (ADDENDUM_61A — org-type-aware rendering)
 * requireAgentWriteAccess()   — Single chokepoint for all agent-side mutations (ADDENDUM_57G)
 */
import { cache } from "react"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { setSentryUser } from "@/lib/observability/user-context"
import { getOrgCapabilities, type OrgCapabilities } from "@/lib/org/capabilities"
import type { OrgType } from "@/lib/constants"
import { gateway, resolveOrgMembership, type GatewayContext } from "@/lib/supabase/gateway"
import { hasCapability } from "@/lib/auth/can"
import {
  canPerformAgentAction,
  SubscriptionLockdownError,
  SubscriptionStateUnavailableError,
  type AgentWriteAction,
  type SubscriptionState,
  type SubscriptionStatus,
} from "@/lib/subscriptions/state"

/**
 * Cached per-request server auth helpers.
 * React.cache() deduplicates identical calls within a single SSR render tree.
 *
 * getServerUser() calls getUser() which verifies the token against GoTrue.
 * This is the Supabase-recommended approach on the server — avoids the
 * "insecure getSession()" warning and prevents spoofed cookie attacks.
 * The React.cache() wrapper ensures only one GoTrue round-trip per render tree.
 */

export const getServerUser = cache(async () => {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
})

/**
 * Org membership — cached per render tree. **The cookie CHOOSES; the database AUTHORISES.**
 *
 * `pleks_org` is plain JSON, unsigned, and the authenticated user can send whatever they like in it.
 * Its `org_id` is therefore a HINT — it selects WHICH of the caller's memberships to resolve — and
 * `user_orgs` decides whether that membership exists. `role` comes back from the DB row, never from
 * the cookie. That is why the hint pattern is right and "always query" is not: `user_orgs` has no
 * unique constraint on `user_id`, so an unhinted `.single()` errors for anyone in more than one org.
 *
 * ONE IMPLEMENTATION, DELIBERATELY. This delegates to gateway's `resolveOrgMembership` instead of
 * doing its own read. Until 2026-08-23 there were two readers of this cookie: gateway's validated it
 * against `user_orgs`, and this one checked only `parsed.user_id === user.id`. That check stops you
 * replaying SOMEONE ELSE'S cookie; it does nothing about forging your own — put your real user_id in
 * beside any `org_id` and `role: "owner"` and it was accepted verbatim, then handed to
 * `createServiceClient()` queries whose only tenancy boundary is the `.eq("org_id", …)` filter the
 * caller had just supplied. The correct check was already twenty lines below, in this function's own
 * DB fallback, which the cookie branch skipped. Two readers with different apertures is the
 * 2026-08-22 scar (CLAUDE.md §6); two with identical apertures is that scar waiting for one of them
 * to be edited. Share the implementation — do not re-derive it here.
 *
 * NO `tier` FIELD, DELIBERATELY. It used to be returned straight from the cookie while `org_id` and
 * `role` were validated, and partial validation is worse than none: the sound fields lend their
 * credibility to the unsound one, and nobody reading `membership.tier` has a reason to suspect it is
 * weaker than `membership.role`. For a tier, call `getOrgTierCanonical(orgId)` from `@/lib/tier/getOrgTier`.
 *
 * THROWS on a transient DB failure (`GatewayUnavailableError`, from the delegate) rather than
 * returning null. That is a behaviour change: callers `redirect("/login")` on null, so a slow DB
 * used to bounce an authenticated user to the login page. An error boundary is the honest response.
 *
 * NOTE: Never call cookieStore.set() here — Server Components cannot write cookies.
 * The middleware (proxy.ts) writes pleks_org after the user_orgs DB check.
 */
export const getServerOrgMembership = cache(async () => {
  const user = await getServerUser()
  if (!user) return null

  const membership = await resolveOrgMembership(user.id)
  if (!membership) return null

  setSentryUser({ id: user.id, org_id: membership.org_id, role: membership.role })
  return { org_id: membership.org_id, role: membership.role }
})

export interface IdentityForkState {
  /** True once an Owner→Steward+ upgrade has decoupled this user's self-managed identity. */
  forked: boolean
  /** The landlord record that WAS this user — scopes the landlord-surface banner. */
  forkedLandlordId: string | null
  dismissedAgent: boolean
  dismissedLandlord: boolean
}

/**
 * Identity-fork banner state for the current user (ADDENDUM_01C §6) — cached per render tree.
 * Reads the fork stamp + per-surface dismissal from user_profiles. Returns null when not signed in
 * or the profile row is missing. Used by the agent-settings + landlord-record banner surfaces.
 */
export const getIdentityForkState = cache(async (): Promise<IdentityForkState | null> => {
  const user = await getServerUser()
  if (!user) return null

  const service = await createServiceClient()
  const { data, error } = await service
    .from("user_profiles")
    .select("identity_forked_at, forked_landlord_id, fork_banner_dismissed_agent, fork_banner_dismissed_landlord")
    .eq("id", user.id)
    .maybeSingle()
  if (error) {
    console.error("[getIdentityForkState] query failed:", error.message)
    return null
  }
  if (!data) return null

  return {
    forked: data.identity_forked_at != null,
    forkedLandlordId: (data.forked_landlord_id as string | null) ?? null,
    dismissedAgent: data.fork_banner_dismissed_agent === true,
    dismissedLandlord: data.fork_banner_dismissed_landlord === true,
  }
})

/**
 * Org capabilities — cached per render tree (ADDENDUM_61A). ONE PATH: the database.
 * Resolves org type + name + subscription status from DB, derives the full capability object.
 * Use in server components for redirect guards and capability-aware rendering.
 *
 * THE COOKIE FAST PATH WAS REMOVED 2026-08-23 (CD ruling), not repaired. It read `type`, `name` and
 * `sub_status` out of the unsigned `pleks_org` cookie and validated none of them, while
 * `getServerOrgMembership` — read on the same pages, one line above — had just been converged onto a
 * DB-validated resolver. Three unvalidated fields sitting beside two validated ones, on the same
 * object graph, with nothing at either call site saying which is which, is the partial-validation
 * trap that removed `tier` from that function's return, one object over.
 *
 * DROPPED RATHER THAN VALIDATED, deliberately. Validating three fields invites "which fields are
 * safe?" to be re-answered later by someone with less context, and `name` looking harmless today is
 * the same argument as `role` being UI-only — an argument about the current call sites, not about
 * the mechanism. `caps.hasHOA` and `caps.hasLandlordsList` gate route redirects
 * (`app/(dashboard)/hoa/page.tsx`, `app/(dashboard)/landlords/page.tsx`), so `type: "hoa"` in your
 * own cookie passed the first of them.
 *
 * The write gate was never on this path and still is not: `requireAgentWriteAccess` reads
 * `subscriptions` directly via `getSubscriptionState(gw.orgId)`, and `isLockedDown` has no readers.
 * That bounded the severity to route visibility; it was not the reason to keep the fast path.
 *
 * Costs one round-trip per render tree (React.cache deduplicates); the two queries run in parallel.
 */
export const getCurrentOrgCapabilities = cache(async (): Promise<OrgCapabilities | null> => {
  const membership = await getServerOrgMembership()
  if (!membership) return null

  const service = await createServiceClient()
  const [{ data: org, error }, { data: sub, error: subError }] = await Promise.all([
    service.from("organisations").select("type, name").eq("id", membership.org_id).single(),
    service.from("subscriptions").select("status").eq("org_id", membership.org_id).not("status", "eq", "purged").maybeSingle(),
  ])

  if (error) {
    console.error("[getCurrentOrgCapabilities] query failed:", error.message)
    return null
  }
  if (!org) return null

  // An unread subscription row is NOT "active" — it is unknown, and `?? "active"` would render a
  // paused org's banner as healthy. This error went unchecked while the cookie was the usual path
  // and the DB was the rare fallback; removing the fast path makes it the only path, so it is
  // checked now. Returning null degrades to "capabilities unknown", which every caller already
  // handles (the redirect guards send the user somewhere safe rather than granting access).
  if (subError) {
    console.error("[getCurrentOrgCapabilities] subscription read failed:", subError.message)
    return null
  }

  return getOrgCapabilities(
    (org.type as OrgType) ?? "agency",
    org.name as string,
    (sub?.status as SubscriptionStatus | null) ?? "active",
  )
})

/**
 * Current subscription state — cached per render tree (ADDENDUM_57G). ONE PATH: the database.
 * Used by server components that need the full SubscriptionState (e.g. email footer variant,
 * dunning cron).
 *
 * ITS COOKIE FAST PATH WENT WITH getCurrentOrgCapabilities', in the same change and for the same
 * reason. It read the same unvalidated `sub_status` and it sits twenty lines away — fixing one and
 * leaving the other is how a repo ends up with two readers of one forgeable field at different
 * apertures, which is the 2026-08-22 scar this whole batch has been unwinding.
 *
 * The fast path also returned a SubscriptionState with every lifecycle date null-filled from the
 * fallback, so `past_due_since`/`paused_at`/`cancelled_at` were absent whenever the cookie answered.
 * A caller reading those dates got nulls that meant "not in the cookie", not "not set".
 *
 * KEPT rather than deleted despite having no callers today, because the tag below records that it
 * was built ahead of the consumers ADDENDUM_57G names. Deleting it is also defensible; what is not
 * is leaving it reading a forgeable value while it waits. (Naming the tag token in this prose is
 * what broke the knip-floor parity when this docstring was first written — the floor greps the
 * token, so a mention counts as a tag.)
 * @knipignore Built ahead of the consumers ADDENDUM_57G names.
 */
export const getCurrentSubscriptionState = cache(async (): Promise<SubscriptionState> => {
  const membership = await getServerOrgMembership()
  if (!membership) {
    return {
      status: "active", past_due_since: null, paused_at: null,
      cancelled_at: null, purge_eligible_at: null,
    }
  }

  return getSubscriptionState(membership.org_id)
})

// ── ADDENDUM_57G — agent write gate ───────────────────────────────────────────

async function getSubscriptionState(orgId: string): Promise<SubscriptionState> {
  const service = await createServiceClient()
  const { data, error } = await service
    .from("subscriptions")
    .select("status, past_due_since, paused_at, cancelled_at, purge_eligible_at")
    .eq("org_id", orgId)
    // A purged row is history, not a subscription. Excluded here for the same reason
    // getCurrentOrgCapabilities excludes it — and NOT excluding it is half of the defect below.
    .not("status", "eq", "purged")
    .maybeSingle()

  // A FAILED READ IS NOT AN ACTIVE SUBSCRIPTION. This was one branch — `if (error || !data)` —
  // which conflated the legitimate case (no row at all = owner-free tier, permitted to write) with
  // the one that must never grant anything (the query did not answer). The gate that decides
  // whether a paused org may write was reading its own data source fail-open.
  //
  // NOT HYPOTHETICAL, and this is why it is worth the error class. `subscriptions.org_id` carries
  // an INDEX, not a unique constraint (001_foundation.sql:265), so ">1 row" lands on the error
  // branch too — and in production, as at 2026-08-23, the ONLY org holding a subscription held two
  // rows (one `purged`, one `active`). `.single()` therefore errored on every call and the gate
  // returned "active" unconditionally. It read as correct only because that org happens to BE
  // active; had it been paused, every agent write would still have been allowed.
  //
  // Same shape as the `user_orgs` `.single()` corrected earlier the same day: a query written as if
  // a uniqueness constraint existed, failing into the permissive answer when it does not.
  if (error) throw new SubscriptionStateUnavailableError(error.message)

  // Genuinely no row = owner-free tier. This is the ONLY thing the fallback was ever meant to cover.
  if (!data) {
    return { status: "active", past_due_since: null, paused_at: null, cancelled_at: null, purge_eligible_at: null }
  }

  return {
    status:            (data.status as SubscriptionStatus) ?? "active",
    past_due_since:    data.past_due_since    ? new Date(data.past_due_since as string)    : null,
    paused_at:         data.paused_at         ? new Date(data.paused_at as string)         : null,
    cancelled_at:      data.cancelled_at      ? new Date(data.cancelled_at as string)      : null,
    purge_eligible_at: data.purge_eligible_at ? new Date(data.purge_eligible_at as string) : null,
  }
}

/**
 * Single chokepoint for all agent-side mutations (ADDENDUM_57G D-57G-08).
 * Call this instead of gateway() in any server action or route handler that writes.
 *
 * Throws SubscriptionLockdownError (HTTP 403) when the org is paused or cancelled.
 * Throws SubscriptionStateUnavailableError when the subscription could not be READ — a distinct
 * error because it is not a 403: the caller must not tell the user anything about their plan, and
 * the routes that catch SubscriptionLockdownError deliberately do not catch this one. Until
 * 2026-08-23 this case returned "active" and the write proceeded.
 * Throws a plain Error when the user is not authenticated.
 *
 * Usage:
 *   const gw = await requireAgentWriteAccess("create_lease")
 *   // proceed — org is active and user is authenticated
 */
// RBAC P4 — central action→capability map. A mutation's write-action gates on the matching capability
// (owner/is_admin exempt). Only cleanly-mapped actions are listed; reused actions (edit_lease — also deposit
// charges; send_manual_comm — many senders) + the finance actions are gated at their call sites instead, and
// unmapped/arbitrary actions are not capability-gated here (the route guard is their access control).
const ACTION_CAPABILITY: Record<string, string> = {
  // leases
  create_lease: "leases", activate_lease: "leases", renew_lease: "leases", terminate_lease: "leases",
  issue_demand_to_vacate: "leases",   // LEG-NOTICES-01 — a Demand to Vacate is a lease-capability action (agent role required, not bare membership)
  // properties (+ warranties, which are property records)
  create_property: "properties", edit_property: "properties",
  create_warranty: "properties", archive_warranty: "properties",
  // tenants
  create_tenant: "tenants", edit_tenant: "tenants", update_tenant: "tenants", ensure_tenant_for_contact: "tenants",
  promote_applicant: "tenants",   // applicant→tenant promotion creates a tenant — same authority bar as create_tenant
  // landlords
  create_landlord: "landlords", update_landlord: "landlords", add_self_as_landlord: "landlords",
  // applications
  create_application: "applications", run_searchworx_check: "applications", upload_application_document: "applications",
  // inspections
  sign_off_inspection: "inspections",
  // maintenance (incl. contractors/suppliers)
  assign_maintenance: "maintenance", accept_quote: "maintenance", sign_off_maintenance: "maintenance",
  add_contractor: "maintenance", update_contractor: "maintenance", reactivate_supplier: "maintenance",
  // finance (bank import + reconciliation sign-off; payment/arrears/trust actions are call-site gated)
  create_bank_import: "finance", sign_off_recon: "finance",
  // team
  invite_user: "team", change_team_role: "team",
  create_team: "team", update_team: "team", archive_team: "team", add_team_member: "team", remove_team_member: "team",
  // org settings
  edit_org_settings: "org",
  // documents
  run_ai_clause_draft: "documents",
  // NOTE deliberately NOT mapped (call-site gated or intentionally broad): edit_lease (reused by deposit
  // charges → finance call-site), send_manual_comm (reused across domains → call-site), update_profile
  // (own account — never gate), save_signature (portal), work-reassignment actions (not destructive/cost).
}

export async function requireAgentWriteAccess(
  action: AgentWriteAction,
): Promise<GatewayContext> {
  const gw = await gateway()
  if (!gw) throw new Error("Not authenticated")
  // Capability gate (RBAC P4) — owner/is_admin exempt (hasCapability short-circuits); the server boundary
  // for the mapped write actions. Uses the resolved gw — no extra gateway() round-trip.
  const reqCap = ACTION_CAPABILITY[action]
  if (reqCap && !(await hasCapability(gw, reqCap))) {
    throw new Error(`Missing capability: ${reqCap}`)
  }
  const sub = await getSubscriptionState(gw.orgId)
  const result = canPerformAgentAction(sub, action)
  if (!result.allowed) throw new SubscriptionLockdownError(result.reason, action)
  return gw
}

export type { AgentWriteAction } from "@/lib/subscriptions/state"
export type { GatewayContext } from "@/lib/supabase/gateway"
