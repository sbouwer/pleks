/**
 * test/db/surety-party-uniqueness.dbtest.ts — the two partial unique indexes that make a surety
 * party unrepeatable (M-116)
 *
 * Auth:   service-role client vs LOCAL Supabase (npm run test:db)
 *
 * Notes:  The hazard is a duplicated CHARGE, not a duplicated row. `screeningFeeCents` multiplies
 *         APPLICATION_FEE_CENTS by the surety count, and every surety line also sends a real
 *         invitation email to a real portal — so a re-entered declaration step that INSERTs
 *         unconditionally quotes the applicant more money for people who do not exist.
 *
 *         Both indexes are PARTIAL, and every one of those predicates is probed here rather than
 *         assumed, because the recorded finding on M-116 was precisely that the obvious non-partial
 *         key does not work: `replaceDirector` supersedes a director, so the key must not see the
 *         superseded row, and the residential joint flow shares the co-applicant table, so the key
 *         must not see plain co-applicants either.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { randomUUID } from "node:crypto"
import { svc, seedLedgerCase, teardownOrg } from "@/test/db/tier"

const db = svc()

const DUPE = "23505"

/** org → property → unit → listing, because `applications.listing_id` is NOT NULL. */
async function seedOrgWithApplication(): Promise<{ orgId: string; applicationId: string; listingId: string; unitId: string }> {
  const seeded = await seedLedgerCase(db, { invoices: [] })
  const { data: listing, error: listingErr } = await db
    .from("listings")
    .insert({ org_id: seeded.orgId, unit_id: seeded.unitId, property_id: seeded.propertyId, asking_rent_cents: 1_000_000 })
    .select("id").single()
  if (listingErr) throw new Error(`seed listing: ${listingErr.message}`)

  const applicationId = await seedApplication(seeded.orgId, listing.id as string, seeded.unitId)
  return { orgId: seeded.orgId, applicationId, listingId: listing.id as string, unitId: seeded.unitId }
}

async function seedApplication(orgId: string, listingId: string, unitId: string): Promise<string> {
  const { data, error } = await db
    .from("applications")
    .insert({
      org_id: orgId, listing_id: listingId, unit_id: unitId,
      first_name: "Lead", last_name: "Applicant", applicant_email: `lead-${randomUUID()}@example.test`,
    })
    .select("id")
    .single()
  if (error) throw new Error(`seedApplication: ${error.message}`)
  return data.id as string
}

function director(applicationId: string, orgId: string, email: string | null, extra: Record<string, unknown> = {}) {
  return {
    org_id: orgId,
    application_id: applicationId,
    first_name: "Dee",
    last_name: "Rector",
    email,
    is_signing_surety: true,
    ...extra,
  }
}

function coApplicant(applicationId: string, orgId: string, email: string, extra: Record<string, unknown> = {}) {
  return {
    org_id: orgId,
    primary_application_id: applicationId,
    first_name: "Sue",
    last_name: "Rety",
    applicant_email: email,
    ...extra,
  }
}

describe("uq_app_directors_live_email — one live declaration per person per application", () => {
  let orgId: string
  let applicationId: string
  let listingId: string
  let unitId: string

  beforeAll(async () => {
    const seeded = await seedOrgWithApplication()
    orgId = seeded.orgId
    applicationId = seeded.applicationId
    listingId = seeded.listingId
    unitId = seeded.unitId
  }, 60_000)
  afterAll(() => { if (orgId) teardownOrg(orgId) })

  it("FIRES: the same director declared twice on one application", async () => {
    const first = await db.from("application_directors").insert(director(applicationId, orgId, "dee@acme.test"))
    expect(first.error, "the first declaration is fine").toBeNull()

    const second = await db.from("application_directors").insert(director(applicationId, orgId, "dee@acme.test"))
    expect(second.error?.code, "a re-entered declaration step must not create a second billable line").toBe(DUPE)
  }, 60_000)

  it("FIRES on case difference — a case-different address is the same mailbox", async () => {
    const dupe = await db.from("application_directors").insert(director(applicationId, orgId, "DEE@Acme.TEST"))
    expect(dupe.error?.code).toBe(DUPE)
  }, 60_000)

  it("KNOWN-GOOD: a different director on the same application", async () => {
    const other = await db.from("application_directors").insert(director(applicationId, orgId, "eff@acme.test"))
    expect(other.error, "a real second director is the whole point of the table").toBeNull()
  }, 60_000)

  it("KNOWN-GOOD: the same director on a DIFFERENT application", async () => {
    const otherApp = await seedApplication(orgId, listingId, unitId)
    const ok = await db.from("application_directors").insert(director(otherApp, orgId, "dee@acme.test"))
    expect(ok.error, "one human sits on many boards; the key is per application").toBeNull()
  }, 60_000)

  it("KNOWN-GOOD: replacing a director — the superseded row is excluded by declined_at", async () => {
    // The exact shape M-116 recorded as breaking the naive non-partial key: replaceDirector marks
    // the old row and inserts a new one for the same person.
    const declined = await db.from("application_directors")
      .update({ declined_at: new Date().toISOString(), decline_reason: "replaced" })
      .eq("org_id", orgId).eq("application_id", applicationId).eq("email", "dee@acme.test")
    expect(declined.error).toBeNull()

    const replacement = await db.from("application_directors").insert(director(applicationId, orgId, "dee@acme.test"))
    expect(replacement.error, "a legitimate replacement must not be rejected").toBeNull()
  }, 60_000)

  it("KNOWN-GOOD: two directors with no email — NULLs are distinct, and email is nullable here", async () => {
    const a = await db.from("application_directors").insert(director(applicationId, orgId, null))
    const b = await db.from("application_directors").insert(director(applicationId, orgId, null))
    expect(a.error).toBeNull()
    expect(b.error, "a director with no email cannot be invited and cannot be double-charged").toBeNull()
  }, 60_000)
})

describe("uq_co_applicants_live_surety_email — one live SURETY line per person per application", () => {
  let orgId: string
  let applicationId: string

  // No listing/unit held here — unlike the directors suite, nothing in this one seeds a SECOND
  // application, so the ids would be dead stores.
  beforeAll(async () => {
    const seeded = await seedOrgWithApplication()
    orgId = seeded.orgId
    applicationId = seeded.applicationId
  }, 60_000)
  afterAll(() => { if (orgId) teardownOrg(orgId) })

  it("FIRES on the declaration marker — is_surety_director twice for one person", async () => {
    const first = await db.from("application_co_applicants")
      .insert(coApplicant(applicationId, orgId, "surety@acme.test", { is_surety_director: true }))
    expect(first.error).toBeNull()

    const second = await db.from("application_co_applicants")
      .insert(coApplicant(applicationId, orgId, "surety@acme.test", { is_surety_director: true }))
    expect(second.error?.code).toBe(DUPE)
  }, 60_000)

  it("FIRES on the ROSTER marker — role='guarantor' twice", async () => {
    // The wired writer M-118 found: POST /api/applications/[id]/co-applicant sets `role` and never
    // `is_surety_director`, and dedups nothing. An index naming only the other marker would miss it.
    const first = await db.from("application_co_applicants")
      .insert(coApplicant(applicationId, orgId, "guarantor@acme.test", { role: "guarantor" }))
    expect(first.error).toBeNull()

    const second = await db.from("application_co_applicants")
      .insert(coApplicant(applicationId, orgId, "guarantor@acme.test", { role: "guarantor" }))
    expect(second.error?.code).toBe(DUPE)
  }, 60_000)

  it("FIRES ACROSS the two markers — the same human declared once each way is still one charge", async () => {
    const crossed = await db.from("application_co_applicants")
      .insert(coApplicant(applicationId, orgId, "surety@acme.test", { role: "guarantor" }))
    expect(crossed.error?.code, "two markers, one set — that is the whole point of the shared predicate").toBe(DUPE)
  }, 60_000)

  it("KNOWN-GOOD: a plain residential co-applicant is NOT covered", async () => {
    // Deliberate scope boundary. Joint pricing is a flat two-person fee, not per head, so a duplicate
    // here is a data-quality wart rather than a double charge — and that flow is the busiest live
    // path in the app. Constraining it is a separate decision.
    const a = await db.from("application_co_applicants")
      .insert(coApplicant(applicationId, orgId, "spouse@acme.test", { role: "co_applicant" }))
    const b = await db.from("application_co_applicants")
      .insert(coApplicant(applicationId, orgId, "spouse@acme.test", { role: "co_applicant" }))
    expect(a.error).toBeNull()
    expect(b.error, "the residential joint flow is out of this index's scope, on purpose").toBeNull()
  }, 60_000)

  it("KNOWN-GOOD: a declined surety line can be replaced", async () => {
    const declined = await db.from("application_co_applicants")
      .update({ declined_at: new Date().toISOString(), decline_reason: "replaced" })
      .eq("org_id", orgId).eq("primary_application_id", applicationId).eq("applicant_email", "guarantor@acme.test")
    expect(declined.error).toBeNull()

    const replacement = await db.from("application_co_applicants")
      .insert(coApplicant(applicationId, orgId, "guarantor@acme.test", { role: "guarantor" }))
    expect(replacement.error, "replaceDirector's whole job must remain possible").toBeNull()
  }, 60_000)
})
