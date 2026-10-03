/**
 * test/db/co-applicant-party-set.dbtest.ts — a paid party is never hard-deleted; nothing else about the party set is guarded: trg_co_applicant_party_set, probed both ways (ADDENDUM_14W §0a)
 *
 * Auth:   service-role client vs LOCAL Supabase (npm run test:db)
 * Notes:  Real rows, real trigger. §0 prices, stamps and pays every line on its OWN application_screening_payments row, so
 *         the guard is BEFORE DELETE only and reads the party's OWN line (subject_type co_applicant/guarantor, subject_id =
 *         the co row). Each case seeds its own application so no case reads another's state.
 *         · DELETE a co whose own line is paid → refused
 *         · DELETE a co whose own line is stamped but unpaid, or that has no line → allowed
 *         · add / decline a co after the lead's line is stamped → the lead's line and applications' stamp columns untouched
 *         · the expiry cron's declined_at on a paid co → passes
 *         · deleting a PAID application cascades through its co rows — the guard is not a teardown trap
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { randomUUID } from "node:crypto"
import { svc, seedLedgerCase, teardownOrg } from "@/test/db/tier"

const db = svc()

const STAMP = {
  fee_amount_cents: 32500,
  rate_effective_date: "2026-10-01",
  pricing_policy_version: "v1-test",
  cost_excl_vat_cents: 20125,
  priced_party_count: 2,
  priced_entity: false,
}
const STAMP_COLS = "fee_amount_cents, rate_effective_date, pricing_policy_version, cost_excl_vat_cents, priced_party_count, priced_entity"
const LINE_STAMP = { fee_cents: 16250, rate_effective_date: "2026-10-01", pricing_policy_version: "v1-test", cost_excl_vat_cents: 10062 }
const LINE_COLS = "fee_cents, rate_effective_date, pricing_policy_version, cost_excl_vat_cents, paid_at"
const PAID_AT = "2026-10-02T08:00:00+00:00"

type LineState = "none" | "stamped" | "paid"

let orgId: string
let seeded: { unitId: string; propertyId: string }
let listingId: string
let coIndex = 0

beforeAll(async () => {
  const s = await seedLedgerCase(db, { invoices: [] })
  orgId = s.orgId
  seeded = s
  const { data, error } = await db.from("listings")
    .insert({ org_id: orgId, unit_id: s.unitId, property_id: s.propertyId, asking_rent_cents: 1_000_000 })
    .select("id").single()
  if (error) throw new Error(`seed listing: ${error.message}`)
  listingId = data.id as string
}, 120_000)
afterAll(() => { if (orgId) teardownOrg(orgId) })

async function seedApplication(): Promise<string> {
  const { data: app, error } = await db.from("applications")
    .insert({ org_id: orgId, listing_id: listingId, unit_id: seeded.unitId, first_name: "Lead", last_name: "Applicant", applicant_email: `lead-${randomUUID()}@example.test` })
    .select("id").single()
  if (error) throw new Error(`seed application: ${error.message}`)
  return app.id as string
}

async function addParty(appId: string): Promise<{ id?: string; error: { message: string } | null }> {
  coIndex += 1
  const { data, error } = await db.from("application_co_applicants")
    .insert({ org_id: orgId, primary_application_id: appId, co_applicant_index: coIndex, applicant_email: `co-${coIndex}@example.test`, role: "co_applicant" })
    .select("id").single()
  return { id: data?.id as string | undefined, error }
}

/** A line row for a subject, stamped and optionally paid — what stampLineFee / markLinePaid leave behind. */
async function seedLine(appId: string, subjectType: string, subjectId: string, state: "stamped" | "paid"): Promise<void> {
  const paid = state === "paid" ? { paid_at: PAID_AT } : {}
  const { error } = await db.from("application_screening_payments")
    .insert({ org_id: orgId, application_id: appId, subject_type: subjectType, subject_id: subjectId, ...LINE_STAMP, ...paid })
  if (error) throw new Error(`seed line: ${error.message}`)
}

/** An application with one co row whose OWN line is in the given state. */
async function application(co: LineState): Promise<{ appId: string; coId: string }> {
  const appId = await seedApplication()
  const added = await addParty(appId)
  if (added.error) throw new Error(`seed co row: ${added.error.message}`)
  if (co !== "none") await seedLine(appId, "co_applicant", added.id!, co)
  return { appId, coId: added.id! }
}

async function coRows(coId: string): Promise<number> {
  const { data, error } = await db.from("application_co_applicants").select("id").eq("org_id", orgId).eq("id", coId)
  if (error) throw new Error(`read co: ${error.message}`)
  return data.length
}

async function appStampOf(appId: string): Promise<Record<string, unknown>> {
  const { data, error } = await db.from("applications").select(`${STAMP_COLS}, fee_paid_at`).eq("org_id", orgId).eq("id", appId).single()
  if (error) throw new Error(`read stamp: ${error.message}`)
  return data as Record<string, unknown>
}

async function lineOf(appId: string, subjectType: string, subjectId: string): Promise<Record<string, unknown>> {
  const { data, error } = await db.from("application_screening_payments").select(LINE_COLS)
    .eq("org_id", orgId).eq("application_id", appId).eq("subject_type", subjectType).eq("subject_id", subjectId).single()
  if (error) throw new Error(`read line: ${error.message}`)
  return data as Record<string, unknown>
}

describe("trg_co_applicant_party_set — DELETE of a co row", () => {
  it("PLANTED: deleting a co whose OWN line is paid is refused, and the row survives", async () => {
    const { coId } = await application("paid")
    const { error } = await db.from("application_co_applicants").delete().eq("org_id", orgId).eq("id", coId)
    expect(error?.message).toMatch(/a party who has paid is never removed/)
    expect(await coRows(coId)).toBe(1)
  })

  it("KNOWN-GOOD: deleting a co whose line is stamped but unpaid is allowed", async () => {
    const { coId } = await application("stamped")
    const { error } = await db.from("application_co_applicants").delete().eq("org_id", orgId).eq("id", coId)
    expect(error).toBeNull()
    expect(await coRows(coId)).toBe(0)
  })

  it("KNOWN-GOOD: deleting a co with no line at all is allowed", async () => {
    const { coId } = await application("none")
    const { error } = await db.from("application_co_applicants").delete().eq("org_id", orgId).eq("id", coId)
    expect(error).toBeNull()
    expect(await coRows(coId)).toBe(0)
  })

  it("KNOWN-GOOD: the lead's paid line does not protect an unpaid co (the guard reads the party's OWN line)", async () => {
    const { appId, coId } = await application("none")
    await seedLine(appId, "applicant", appId, "paid")
    const { error } = await db.from("application_co_applicants").delete().eq("org_id", orgId).eq("id", coId)
    expect(error).toBeNull()
    expect(await coRows(coId)).toBe(0)
  })
})

describe("trg_co_applicant_party_set — the lead's stamp is not a party-set stamp any more", () => {
  async function stampedLead(): Promise<{ appId: string; coId: string }> {
    const { appId, coId } = await application("none")
    await seedLine(appId, "applicant", appId, "stamped")
    const { error } = await db.from("applications").update(STAMP).eq("org_id", orgId).eq("id", appId)
    if (error) throw new Error(`seed app stamp: ${error.message}`)
    return { appId, coId }
  }

  it("KNOWN-GOOD: a co ADDED after the lead's line is stamped touches neither the line nor applications' stamp columns", async () => {
    const { appId } = await stampedLead()
    const added = await addParty(appId)
    expect(added.error).toBeNull()
    expect(await lineOf(appId, "applicant", appId)).toMatchObject({ ...LINE_STAMP, paid_at: null })
    expect(await appStampOf(appId)).toMatchObject(STAMP)
  })

  it("KNOWN-GOOD: a co DECLINED after the lead's line is stamped touches neither", async () => {
    const { appId, coId } = await stampedLead()
    const { error } = await db.from("application_co_applicants").update({ declined_at: PAID_AT }).eq("org_id", orgId).eq("id", coId)
    expect(error).toBeNull()
    expect(await lineOf(appId, "applicant", appId)).toMatchObject({ ...LINE_STAMP, paid_at: null })
    expect(await appStampOf(appId)).toMatchObject(STAMP)
  })

  it("KNOWN-GOOD: a co added after the lead's line is PAID is allowed — it is a new line, not a refusal", async () => {
    const appId = await seedApplication()
    await seedLine(appId, "applicant", appId, "paid")
    const added = await addParty(appId)
    expect(added.error).toBeNull()
    expect(await lineOf(appId, "applicant", appId)).toMatchObject({ ...LINE_STAMP, paid_at: expect.any(String) })
  })
})

describe("trg_co_applicant_party_set — paid lines", () => {
  it("KNOWN-GOOD: the expiry cron's declined_at passes on a paid co, and its line is untouched", async () => {
    const { appId, coId } = await application("paid")
    const { error } = await db.from("application_co_applicants").update({ declined_at: PAID_AT }).eq("org_id", orgId).eq("id", coId)
    expect(error).toBeNull()
    expect(await lineOf(appId, "co_applicant", coId)).toMatchObject({ ...LINE_STAMP, paid_at: expect.any(String) })
  })

  it("KNOWN-GOOD: deleting a PAID application cascades through its co rows", async () => {
    const { appId, coId } = await application("stamped")
    await seedLine(appId, "applicant", appId, "paid")
    const { error } = await db.from("applications").delete().eq("org_id", orgId).eq("id", appId)
    expect(error).toBeNull()
    expect(await coRows(coId)).toBe(0)
  })

  // The §0a probe that caught the re-keyed guard refusing the FK cascade: the co row is deleted while its OWN paid line is
  // still visible, so the guard holds only while the parent application exists. Deleting the application is not removing
  // a party.
  it("KNOWN-GOOD: deleting an application whose co line is PAID cascades through its co rows", async () => {
    const { appId, coId } = await application("paid")
    const { error } = await db.from("applications").delete().eq("org_id", orgId).eq("id", appId)
    expect(error).toBeNull()
    expect(await coRows(coId)).toBe(0)
  })
})
