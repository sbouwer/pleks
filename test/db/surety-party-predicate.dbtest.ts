/**
 * test/db/surety-party-predicate.dbtest.ts — the SQL surety predicate agrees with the TS one (BUILD_72 P1-R1)
 *
 * Auth:   service-role client vs LOCAL Supabase (npm run test:db)
 *
 * Notes:  `is_surety_party()` (005) is the SQL twin of `isSuretyParty` (lib/applications/juristicParties.ts):
 *         one predicate, two languages. The view's `party_kind` is what the reminder cron routes copy by,
 *         so a disagreement sends a residential co-applicant director copy, or a surety joint-rental copy.
 *         Every marker shape the schema admits is planted (role ∈ co_applicant | guarantor | NULL, crossed
 *         with is_surety_director true | false) and the view's answer is compared row by row with the TS
 *         answer — both directions, so a predicate that said 'surety' (or 'co_applicant') for everything
 *         fails here.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { randomUUID } from "node:crypto"
import { svc, seedLedgerCase, teardownOrg } from "@/test/db/tier"
import { isSuretyParty } from "@/lib/applications/juristicParties"

const db = svc()

const SHAPES: ReadonlyArray<{ role: string | null; is_surety_director: boolean }> = [
  { role: "co_applicant", is_surety_director: false },
  { role: "co_applicant", is_surety_director: true },
  { role: "guarantor", is_surety_director: false },
  { role: "guarantor", is_surety_director: true },
  { role: null, is_surety_director: false },
  { role: null, is_surety_director: true },
]

describe("is_surety_party() ⇄ isSuretyParty — v_application_screening_lines.party_kind", () => {
  let orgId: string
  let applicationId: string
  const planted = new Map<string, (typeof SHAPES)[number]>()

  beforeAll(async () => {
    const seeded = await seedLedgerCase(db, { invoices: [] })
    orgId = seeded.orgId
    const { data: listing, error: listingErr } = await db.from("listings")
      .insert({ org_id: orgId, unit_id: seeded.unitId, property_id: seeded.propertyId, asking_rent_cents: 1_000_000 })
      .select("id").single()
    if (listingErr) throw new Error(`seed listing: ${listingErr.message}`)
    const { data: app, error: appErr } = await db.from("applications")
      .insert({ org_id: orgId, listing_id: listing.id, unit_id: seeded.unitId, first_name: "Lead", last_name: "Applicant", applicant_email: `lead-${randomUUID()}@example.test` })
      .select("id").single()
    if (appErr) throw new Error(`seed application: ${appErr.message}`)
    applicationId = app.id as string

    for (const [i, shape] of SHAPES.entries()) {
      // Distinct emails: two shapes are surety parties, and uq_co_applicants_live_surety_email is per person.
      const { data, error } = await db.from("application_co_applicants")
        .insert({ org_id: orgId, primary_application_id: applicationId, co_applicant_index: i + 1, applicant_email: `party-${i}@example.test`, ...shape })
        .select("id").single()
      if (error) throw new Error(`plant shape ${i}: ${error.message}`)
      planted.set(data.id as string, shape)
    }
  }, 60_000)
  afterAll(() => { if (orgId) teardownOrg(orgId) })

  it("every planted shape reads the same in SQL as in TS", async () => {
    const { data, error } = await db.from("v_application_screening_lines")
      .select("subject_id, party_kind")
      .eq("org_id", orgId)
      .eq("application_id", applicationId)
      .eq("subject_type", "co_applicant")
    expect(error).toBeNull()
    expect(data).toHaveLength(SHAPES.length)
    for (const row of data ?? []) {
      const shape = planted.get(row.subject_id as string)
      expect(shape, "the view returned a row that was not planted").toBeDefined()
      const expected = isSuretyParty(shape!) ? "surety" : "co_applicant"
      expect(row.party_kind, `role=${shape!.role} is_surety_director=${shape!.is_surety_director}`).toBe(expected)
    }
  }, 60_000)

  it("both answers occur — the comparison above is not vacuous", async () => {
    const kinds = new Set([...planted.values()].map((s) => (isSuretyParty(s) ? "surety" : "co_applicant")))
    expect(kinds).toEqual(new Set(["surety", "co_applicant"]))
  })
})
