/**
 * lib/leases/applicationLink.ts — the approval → lease hand-off: resolve an approved application into lease
 *                                  prefill, and link the lease it produces back to it
 *
 * Auth:   none of its own — callers pass a db already behind their gate (gatewaySSR / requireAgentWriteAccess)
 * Data:   reads applications, units, listings, application_co_applicants; writes applications.resulting_lease_id
 *         and audit_log; deletes a just-inserted draft lease that lost the claim. leases.originating_application_id
 *         is written by the create actions themselves.
 * Notes:  Walkability census B2 (arc 2, 2026-10-09): an approved applicant reached /tenants/[id] with no route to
 *         a lease and the application id was lost. The two link columns (004 originating_application_id, 005
 *         resulting_lease_id) existed with no writer. Every read is org-bound: the application id comes from a URL
 *         or a form field. Only LIVE, non-surety co-applicants already holding a tenant row prefill — the rest
 *         become tenants on activation (schema-gotchas: applicant ≡ tenant), so the agent adds them in the wizard.
 *         One lease per application: checkOriginatingApplication is the early, friendly refusal; the lock is
 *         claimApplicationForLease, an atomic conditional UPDATE right after the lease INSERT, whose loser discards
 *         its own fresh draft (Stéan 2026-10-09: "we don't want multiple leases hanging around"). No DDL — a partial
 *         unique index on leases(originating_application_id) would add a DB-level backstop and stays queued.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { recordAudit } from "@/lib/audit/recordAudit"
import { onlyLiveCoParties } from "@/lib/applications/liveCoParties"
import { isSuretyParty } from "@/lib/applications/juristicParties"

export interface ApprovedApplication {
  id: string
  tenantId: string
  unitId: string
  propertyId: string | null
  /** the listing's advertised rent — what the applicant applied at; seeds the wizard over the unit's asking rent */
  listingRentCents: number | null
  coTenantIds: string[]
  /** set once a lease was created from it — the hand-off then points at that lease instead */
  resultingLeaseId: string | null
}

/** The org's approved application with a tenant, or null (missing, foreign, not approved, or unreadable). */
export async function resolveApprovedApplication(
  db: SupabaseClient,
  orgId: string,
  applicationId: string,
): Promise<ApprovedApplication | null> {
  const { data: app, error } = await db
    .from("applications")
    .select("id, tenant_id, unit_id, listing_id, stage2_status, resulting_lease_id")
    .eq("id", applicationId)
    .eq("org_id", orgId)
    .maybeSingle()
  if (error) {
    console.error("resolveApprovedApplication applications:", error.message)
    return null
  }
  if (!app || app.stage2_status !== "approved" || !app.tenant_id) return null

  const [unitRes, listingRes, coRes] = await Promise.all([
    db.from("units").select("property_id").eq("id", app.unit_id).eq("org_id", orgId).maybeSingle(),
    db.from("listings").select("asking_rent_cents").eq("id", app.listing_id).eq("org_id", orgId).maybeSingle(),
    // Live parties only (a declined or erased co is no longer in the application), and never a surety: a surety
    // guarantees the lease, it is not a lessee on it (walker F1).
    onlyLiveCoParties(
      db.from("application_co_applicants").select("tenant_id, role, is_surety_director")
        .eq("primary_application_id", app.id).eq("org_id", orgId).not("tenant_id", "is", null),
    ),
  ])
  if (unitRes.error) console.error("resolveApprovedApplication units:", unitRes.error.message)
  if (listingRes.error) console.error("resolveApprovedApplication listings:", listingRes.error.message)
  if (coRes.error) console.error("resolveApprovedApplication co-applicants:", coRes.error.message)

  return {
    id: app.id as string,
    tenantId: app.tenant_id as string,
    unitId: app.unit_id as string,
    propertyId: (unitRes.data?.property_id as string | undefined) ?? null,
    listingRentCents: (listingRes.data?.asking_rent_cents as number | null | undefined) ?? null,
    coTenantIds: (coRes.data ?? [])
      .filter((r) => r.tenant_id && !isSuretyParty(r as { role?: string | null; is_surety_director?: boolean | null }))
      .map((r) => r.tenant_id as string),
    resultingLeaseId: (app.resulting_lease_id as string | null) ?? null,
  }
}

/**
 * Validate a create action's application_id against what the lease is being created for. Returns the id to
 * stamp on leases.originating_application_id, null when none was sent, or an error the agent can act on.
 */
export async function checkOriginatingApplication(
  db: SupabaseClient,
  orgId: string,
  applicationId: string | null,
  lease: { tenantId: string; unitId: string },
  actorId: string,
): Promise<{ applicationId: string | null } | { error: string }> {
  if (!applicationId) return { applicationId: null }
  const app = await resolveApprovedApplication(db, orgId, applicationId)
  if (!app) return { error: "That application is not approved, or no longer available." }
  if (app.resultingLeaseId) return { error: await alreadyLeasedMessage(db, orgId, app.id, actorId) }
  // The wizard lets the agent change unit and tenant; a lease for someone else is not this application's lease.
  if (app.tenantId !== lease.tenantId || app.unitId !== lease.unitId) {
    return { error: "This lease's tenant or unit no longer matches the approved application. Go back and restore the applicant and unit — or, for a different tenant or unit, close this and create the lease from Leases instead." }
  }
  return { applicationId: app.id }
}

/**
 * INSERT a lease and, when it comes from an application, take that application's one-lease lock in the same breath —
 * the ONLY way a create action writes a leases row from an application, so the claim cannot drift below the child
 * rows (walker F1: most 004 lease children reference leases(id) without ON DELETE CASCADE, so a discard after them
 * would fail and leave the duplicate). The caller writes children only after this returns a leaseId.
 */
export async function insertLeaseClaimingApplication(
  db: SupabaseClient,
  orgId: string,
  row: Record<string, unknown>,
  applicationId: string | null,
  actorId: string,
): Promise<{ leaseId: string } | { error: string }> {
  const { data: lease, error } = await db
    .from("leases")
    .insert({ ...row, org_id: orgId, originating_application_id: applicationId })
    .select("id")
    .single()
  if (error || !lease) return { error: error?.message || "Failed to create lease" }
  const leaseId = lease.id as string
  if (!applicationId) return { leaseId }

  const claim = await claimApplicationForLease(db, orgId, applicationId, leaseId, actorId)
  if (claim === "claimed") return { leaseId }
  await discardUnclaimedLease(db, orgId, leaseId, applicationId, actorId)
  if (claim === "failed") return { error: "The lease could not be linked to its application, so it was not created. Try again." }
  return { error: await alreadyLeasedMessage(db, orgId, applicationId, actorId) }
}

/**
 * Name who holds the application's lease rather than show a bare error (Stéan 2026-10-09). The holder is the
 * creator of the lease resulting_lease_id points at; a double submit by the same agent is told so, not named.
 * Both lookups are org-bound; user_profiles is identity-scoped (read by id, like every other site).
 */
async function alreadyLeasedMessage(db: SupabaseClient, orgId: string, applicationId: string, actorId: string): Promise<string> {
  const fallback = "A colleague is already creating the lease for this application. Open it from the application instead."
  const { data: app, error: appError } = await db
    .from("applications").select("resulting_lease_id").eq("id", applicationId).eq("org_id", orgId).maybeSingle()
  if (appError) console.error("alreadyLeasedMessage applications:", appError.message)
  if (!app?.resulting_lease_id) return fallback
  const { data: lease, error: leaseError } = await db
    .from("leases").select("created_by").eq("id", app.resulting_lease_id).eq("org_id", orgId).maybeSingle()
  if (leaseError) console.error("alreadyLeasedMessage leases:", leaseError.message)
  if (!lease?.created_by) return fallback
  if (lease.created_by === actorId) {
    return "You have already created the lease for this application (perhaps in another tab). Open it from the application."
  }
  const { data: profile, error: profileError } = await db
    .from("user_profiles").select("full_name").eq("id", lease.created_by).maybeSingle()
  if (profileError) console.error("alreadyLeasedMessage user_profiles:", profileError.message)
  const name = (profile?.full_name as string | null | undefined)?.trim()
  return name ? `${name} is already creating the lease for this application. Open it from the application instead.` : fallback
}

/**
 * The one-lease-per-application lock. The conditional UPDATE is atomic in Postgres: two concurrent claims serialise
 * on the application row's lock, the second re-reads `resulting_lease_id IS NULL` after the first commits and
 * matches nothing.
 */
async function claimApplicationForLease(
  db: SupabaseClient,
  orgId: string,
  applicationId: string,
  leaseId: string,
  actorId: string,
): Promise<"claimed" | "taken" | "failed"> {
  const { data, error } = await db
    .from("applications")
    .update({ resulting_lease_id: leaseId })
    .eq("id", applicationId)
    .eq("org_id", orgId)
    .is("resulting_lease_id", null)
    .select("id")
  if (error) {
    console.error("claimApplicationForLease:", applicationId, leaseId, error.message)
    return "failed"
  }
  if (!data?.length) return "taken"
  await recordAudit(db, { orgId, table: "applications", recordId: applicationId, action: "UPDATE", actorId, after: {
    action: "lease_created_from_application", resulting_lease_id: leaseId,
  } })
  return "claimed"
}

/**
 * Remove a lease that lost (or could not take) its application claim. It was inserted moments ago as a draft with
 * no child rows yet, so the row is all there is. Its DELETE audit row stands alone: the INSERT audit is written by
 * the action only after a successful claim (walker F4 — the after payload carries why). A failed delete is logged
 * loudly: that draft then carries originating_application_id without being the application's lease.
 */
async function discardUnclaimedLease(
  db: SupabaseClient,
  orgId: string,
  leaseId: string,
  applicationId: string,
  actorId: string,
): Promise<void> {
  const { error } = await db.from("leases").delete().eq("id", leaseId).eq("org_id", orgId).eq("status", "draft")
  if (error) {
    console.error("discardUnclaimedLease: orphan draft left behind", leaseId, applicationId, error.message)
    return
  }
  await recordAudit(db, { orgId, table: "leases", recordId: leaseId, action: "DELETE", actorId, after: {
    action: "draft_discarded_application_already_leased", originating_application_id: applicationId,
  } })
}
