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
import { cookies } from "next/headers"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { setSentryUser } from "@/lib/observability/user-context"
import { getOrgCapabilities, type OrgCapabilities } from "@/lib/org/capabilities"
import type { OrgType } from "@/lib/constants"
import { gateway, resolveOrgMembership, type GatewayContext } from "@/lib/supabase/gateway"
import { hasCapability } from "@/lib/auth/can"
import {
  canPerformAgentAction,
  SubscriptionLockdownError,
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
 * Org capabilities — cached per render tree (ADDENDUM_61A).
 * Resolves org type + name from DB, derives the full capability object.
 * Use in server components for redirect guards and capability-aware rendering.
 *
 * When §6.4 (cookie payload extension) ships, this can read type+name from
 * the pleks_org cookie to eliminate the DB round-trip. Until then it queries
 * once per render tree (React.cache deduplicates).
 */
export const getCurrentOrgCapabilities = cache(async (): Promise<OrgCapabilities | null> => {
  const membership = await getServerOrgMembership()
  if (!membership) return null

  // Fast path: pleks_org cookie carries type, name, sub_status (set by proxy.ts).
  const cookieStore = await cookies()
  const raw = cookieStore.get("pleks_org")?.value
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { type?: string; name?: string; sub_status?: string | null }
      if (parsed.type && parsed.name) {
        return getOrgCapabilities(
          parsed.type as OrgType,
          parsed.name,
          (parsed.sub_status ?? "active") as SubscriptionStatus,
        )
      }
    } catch { /* fall through to DB */ }
  }

  // Slow path: DB query (cookie not yet populated — one round-trip, cached per render tree).
  const service = await createServiceClient()
  const [{ data: org, error }, { data: sub }] = await Promise.all([
    service.from("organisations").select("type, name").eq("id", membership.org_id).single(),
    service.from("subscriptions").select("status").eq("org_id", membership.org_id).not("status", "eq", "purged").maybeSingle(),
  ])

  if (error) {
    console.error("[getCurrentOrgCapabilities] query failed:", error.message)
    return null
  }
  if (!org) return null

  return getOrgCapabilities(
    (org.type as OrgType) ?? "agency",
    org.name as string,
    (sub?.status as SubscriptionStatus | null) ?? "active",
  )
})

/**
 * Current subscription state — cached per render tree (ADDENDUM_57G).
 * Reads sub_status from the pleks_org cookie (zero DB on cache hit).
 * Falls back to a DB query on miss. Used by server components that need
 * the full SubscriptionState (e.g. email footer variant, dunning cron).
 * @knipignore Built ahead of the consumers ADDENDUM_57G names.
 */
export const getCurrentSubscriptionState = cache(async (): Promise<SubscriptionState> => {
  const fallback: SubscriptionState = {
    status: "active", past_due_since: null, paused_at: null,
    cancelled_at: null, purge_eligible_at: null,
  }

  const membership = await getServerOrgMembership()
  if (!membership) return fallback

  // Fast path: cookie carries sub_status written by proxy.ts
  const cookieStore = await cookies()
  const raw = cookieStore.get("pleks_org")?.value
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { sub_status?: string | null }
      if (parsed.sub_status) {
        return { ...fallback, status: parsed.sub_status as SubscriptionStatus }
      }
    } catch { /* fall through */ }
  }

  // Slow path: full lifecycle columns from DB
  return getSubscriptionState(membership.org_id)
})

// ── ADDENDUM_57G — agent write gate ───────────────────────────────────────────

async function getSubscriptionState(orgId: string): Promise<SubscriptionState> {
  const service = await createServiceClient()
  const { data, error } = await service
    .from("subscriptions")
    .select("status, past_due_since, paused_at, cancelled_at, purge_eligible_at")
    .eq("org_id", orgId)
    .single()

  if (error || !data) {
    // No subscription row = owner-free tier; treat as active for write purposes.
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
