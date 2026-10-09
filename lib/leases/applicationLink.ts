/**
 * lib/leases/applicationLink.ts — the approval → lease hand-off: resolve an approved application into lease
 *                                  prefill, and link the lease it produces back to it
 *
 * Auth:   none of its own — callers pass a db already behind their gate (gatewaySSR / requireAgentWriteAccess)
 * Data:   reads applications, units, listings, application_co_applicants; writes applications.resulting_lease_id
 *         and audit_log. leases.originating_application_id is written by the create actions themselves.
 * Notes:  Walkability census B2 (arc 2, 2026-10-09): an approved applicant reached /tenants/[id] with no route to
 *         a lease and the application id was lost. The two link columns (004 originating_application_id, 005
 *         resulting_lease_id) existed with no writer. Every read is org-bound: the application id comes from a URL
 *         or a form field. Only LIVE, non-surety co-applicants already holding a tenant row prefill — the rest
 *         become tenants on activation (schema-gotchas: applicant ≡ tenant), so the agent adds them in the wizard.
 *         Two drafts can race from one application (check before insert, no unique index on
 *         originating_application_id); both are deletable drafts and the back-link fills once — accepted for now.
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
): Promise<{ applicationId: string | null } | { error: string }> {
  if (!applicationId) return { applicationId: null }
  const app = await resolveApprovedApplication(db, orgId, applicationId)
  if (!app) return { error: "That application is not approved, or no longer available." }
  if (app.resultingLeaseId) return { error: "A lease was already created from this application." }
  // The wizard lets the agent change unit and tenant; a lease for someone else is not this application's lease.
  if (app.tenantId !== lease.tenantId || app.unitId !== lease.unitId) {
    return { error: "This lease's tenant or unit no longer matches the approved application. Go back and restore the applicant and unit — or, for a different tenant or unit, close this and create the lease from Leases instead." }
  }
  return { applicationId: app.id }
}

/** Point the application at the lease it produced. Only fills an empty link, so a second lease never re-points it. */
export async function linkApplicationToLease(
  db: SupabaseClient,
  orgId: string,
  applicationId: string,
  leaseId: string,
  actorId: string,
): Promise<void> {
  const { data, error } = await db
    .from("applications")
    .update({ resulting_lease_id: leaseId })
    .eq("id", applicationId)
    .eq("org_id", orgId)
    .is("resulting_lease_id", null)
    .select("id")
  // The lease exists and carries originating_application_id, so a failed back-link is reported, not fatal.
  if (error || !data?.length) {
    console.error("linkApplicationToLease:", applicationId, leaseId, error?.message ?? "no row updated")
    return
  }
  await recordAudit(db, { orgId, table: "applications", recordId: applicationId, action: "UPDATE", actorId, after: {
    action: "lease_created_from_application", resulting_lease_id: leaseId,
  } })
}
