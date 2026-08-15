/**
 * test/db/analytics-erasure-survival.dbtest.ts — an analytic fact must outlive its operational parent
 *
 * Auth:   service-role client vs LOCAL Supabase (npm run test:db)
 *
 * Notes:  Guards the single easiest-to-get-wrong line in the analytics-capture spec: the
 *         application ↔ lease linkage FKs are ON DELETE SET NULL, deliberately NOT CASCADE.
 *
 *         A POPIA s24 erasure request must remove IDENTITY, not FACTS. If either FK cascaded, the
 *         first erasure request would silently delete calibration history — and nothing would notice
 *         until the cohort was already gone, years later, at the exact moment it was finally needed.
 *         Reading "ON DELETE SET NULL" in a migration proves the INTENT; only deleting a parent and
 *         finding the child still there proves the BEHAVIOUR. Hence a probe, not a comment.
 *
 *         ⚠ PROBE-FIRES: verified by re-declaring applications_resulting_lease_id_fkey as
 *         ON DELETE CASCADE against the local stack — the surviving-row assertion then fails with
 *         "the application was CASCADE-DELETED by its lease" instead of passing.
 */
import { describe, it, expect, afterAll } from "vitest"
import { svc, seedLedgerCase, teardownOrg } from "@/test/db/tier"

const db = svc()
const orgIds: string[] = []

afterAll(() => { for (const id of orgIds) teardownOrg(id) })

/**
 * A full org → property → unit → tenant → lease chain, PLUS the listing an application needs
 * (leases.unit_id and applications.listing_id are both NOT NULL).
 */
async function seedLeaseAndListing() {
  const seeded = await seedLedgerCase(db, { invoices: [] })
  orgIds.push(seeded.orgId)
  const { data: listing, error } = await db
    .from("listings")
    .insert({ org_id: seeded.orgId, unit_id: seeded.unitId, property_id: seeded.propertyId, asking_rent_cents: 1_000_000 })
    .select("id").single()
  if (error) throw new Error(`seed listing: ${error.message}`)
  return { ...seeded, listingId: listing.id as string }
}

describe("application ↔ lease linkage is erasure-safe", () => {
  it("orphans the lease rather than deleting it when the application is erased", async () => {
    const { orgId, leaseId, listingId, unitId } = await seedLeaseAndListing()

    const { data: app, error: appErr } = await db
      .from("applications")
      .insert({ org_id: orgId, listing_id: listingId, unit_id: unitId, first_name: "Erasure", last_name: "Probe", applicant_email: `probe-${orgId}@dbtest.local` })
      .select("id").single()
    expect(appErr?.message ?? null, "application insert").toBeNull()

    const { error: linkErr } = await db
      .from("leases").update({ originating_application_id: app!.id }).eq("id", leaseId).eq("org_id", orgId)
    expect(linkErr?.message ?? null, "link lease → application").toBeNull()

    // Erase the operational parent, as a POPIA s24 request eventually will.
    const { error: delErr } = await db.from("applications").delete().eq("id", app!.id).eq("org_id", orgId)
    expect(delErr?.message ?? null, "application delete").toBeNull()

    const { data: after, error: afterErr } = await db
      .from("leases").select("id, originating_application_id").eq("id", leaseId).maybeSingle()
    expect(afterErr?.message ?? null).toBeNull()
    expect(after, "the lease was CASCADE-DELETED — erasure destroyed a fact").not.toBeNull()
    expect(after?.originating_application_id, "link should be nulled, not left dangling").toBeNull()
  })

  it("orphans the application's lease pointer rather than deleting the application", async () => {
    const { orgId, leaseId, listingId, unitId } = await seedLeaseAndListing()

    const { data: app, error: appErr } = await db
      .from("applications")
      .insert({
        org_id: orgId, listing_id: listingId, unit_id: unitId, first_name: "Erasure", last_name: "Probe2",
        applicant_email: `probe2-${orgId}@dbtest.local`, resulting_lease_id: leaseId,
      })
      .select("id, resulting_lease_id").single()
    expect(appErr?.message ?? null, "application insert").toBeNull()
    expect(app!.resulting_lease_id).toBe(leaseId)

    const { error: delErr } = await db.from("leases").delete().eq("id", leaseId).eq("org_id", orgId)
    expect(delErr?.message ?? null, "lease delete").toBeNull()

    const { data: after, error: afterErr } = await db
      .from("applications").select("id, resulting_lease_id").eq("id", app!.id).maybeSingle()
    expect(afterErr?.message ?? null).toBeNull()
    expect(after, "the application was CASCADE-DELETED by its lease").not.toBeNull()
    expect(after?.resulting_lease_id, "link should be nulled, not left dangling").toBeNull()
  })
})
