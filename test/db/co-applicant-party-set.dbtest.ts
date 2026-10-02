/**
 * test/db/co-applicant-party-set.dbtest.ts — a quote is bound to the party set it priced: trg_co_applicant_party_set, probed both ways (ADDENDUM_14V §3.5a/b)
 *
 * Auth:   service-role client vs LOCAL Supabase (npm run test:db)
 * Notes:  Real rows, real trigger — the void reaches across tables, so a temp twin would not show it. Each case
 *         seeds its own application so no case reads another's state.
 *         · stamped-unpaid + add / decline a party → all six stamp columns cleared (re-stamped at next first show)
 *         · paid + add a party → refused, the paid fee unchanged (a late party joins a new application)
 *         · paid + DELETE a party → refused (no removal, no refund)
 *         · paid + declined_at (the expiry cron) → passes, stamp untouched — the line declines, the fee stays
 *         · unstamped + add → nothing to void, nothing refused
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
const PAID_AT = "2026-10-02T08:00:00+00:00"

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

/**
 * An application in the given payment state, with one live co row priced into its stamp. Order matters: the co row
 * goes in FIRST and the stamp (and payment) after, exactly as in life — a co row added after payment is refused.
 */
async function application(state: "unstamped" | "stamped" | "paid"): Promise<{ appId: string; coId: string }> {
  const { data: app, error } = await db.from("applications")
    .insert({ org_id: orgId, listing_id: listingId, unit_id: seeded.unitId, first_name: "Lead", last_name: "Applicant", applicant_email: `lead-${randomUUID()}@example.test` })
    .select("id").single()
  if (error) throw new Error(`seed application: ${error.message}`)
  const appId = app.id as string
  const co = await addParty(appId)
  if (co.error) throw new Error(`seed co row: ${co.error.message}`)
  if (state !== "unstamped") {
    const paid = state === "paid" ? { fee_paid_at: PAID_AT, fee_status: "paid" } : {}
    const { error: stampErr } = await db.from("applications").update({ ...STAMP, ...paid }).eq("org_id", orgId).eq("id", appId)
    if (stampErr) throw new Error(`seed stamp: ${stampErr.message}`)
  }
  return { appId, coId: co.id! }
}

async function addParty(appId: string): Promise<{ id?: string; error: { message: string } | null }> {
  coIndex += 1
  const { data, error } = await db.from("application_co_applicants")
    .insert({ org_id: orgId, primary_application_id: appId, co_applicant_index: coIndex, applicant_email: `co-${coIndex}@example.test`, role: "co_applicant" })
    .select("id").single()
  return { id: data?.id as string | undefined, error }
}

async function stampOf(appId: string): Promise<Record<string, unknown>> {
  const { data, error } = await db.from("applications").select(`${STAMP_COLS}, fee_paid_at`).eq("org_id", orgId).eq("id", appId).single()
  if (error) throw new Error(`read stamp: ${error.message}`)
  return data as Record<string, unknown>
}

const CLEARED = Object.fromEntries(Object.keys(STAMP).map((k) => [k, null]))

describe("trg_co_applicant_party_set — stamped, unpaid", () => {
  it("PLANTED: a party ADDED after the quote voids the whole stamp", async () => {
    const { appId } = await application("stamped")
    expect(await stampOf(appId)).toMatchObject(STAMP)
    const added = await addParty(appId)
    expect(added.error).toBeNull()
    expect(await stampOf(appId)).toMatchObject(CLEARED)
  })

  it("PLANTED: a party DECLINED after the quote voids the whole stamp", async () => {
    const { appId, coId } = await application("stamped")
    const { error } = await db.from("application_co_applicants").update({ declined_at: PAID_AT }).eq("org_id", orgId).eq("id", coId)
    expect(error).toBeNull()
    expect(await stampOf(appId)).toMatchObject(CLEARED)
  })

  it("KNOWN-GOOD: an edit that is not a party-set change leaves the stamp alone", async () => {
    const { appId, coId } = await application("stamped")
    const { error } = await db.from("application_co_applicants").update({ first_name: "Renamed" }).eq("org_id", orgId).eq("id", coId)
    expect(error).toBeNull()
    expect(await stampOf(appId)).toMatchObject(STAMP)
  })
})

describe("trg_co_applicant_party_set — paid", () => {
  it("PLANTED: a party added after payment is refused, and the paid fee is unchanged", async () => {
    const { appId } = await application("paid")
    const added = await addParty(appId)
    expect(added.error?.message).toMatch(/a party who arrives after payment joins a new application/)
    expect(await stampOf(appId)).toMatchObject({ ...STAMP, fee_paid_at: PAID_AT })
  })

  it("PLANTED: removing a paid party is refused — no removal, no refund", async () => {
    const { appId, coId } = await application("paid")
    const { error } = await db.from("application_co_applicants").delete().eq("org_id", orgId).eq("id", coId)
    expect(error?.message).toMatch(/a paid party set is frozen/)
    const { data, error: readErr } = await db.from("application_co_applicants").select("id").eq("org_id", orgId).eq("id", coId)
    expect(readErr).toBeNull()
    expect(data).toHaveLength(1)
    expect(await stampOf(appId)).toMatchObject(STAMP)
  })

  it("KNOWN-GOOD: the expiry cron's declined_at passes on a paid party, and the stamp is untouched", async () => {
    const { appId, coId } = await application("paid")
    const { error } = await db.from("application_co_applicants").update({ declined_at: PAID_AT }).eq("org_id", orgId).eq("id", coId)
    expect(error).toBeNull()
    expect(await stampOf(appId)).toMatchObject({ ...STAMP, fee_paid_at: PAID_AT })
  })

  it("KNOWN-GOOD: deleting a PAID application cascades through its co rows", async () => {
    const { appId, coId } = await application("paid")
    const { error } = await db.from("applications").delete().eq("org_id", orgId).eq("id", appId)
    expect(error).toBeNull()
    const { data, error: readErr } = await db.from("application_co_applicants").select("id").eq("org_id", orgId).eq("id", coId)
    expect(readErr).toBeNull()
    expect(data).toHaveLength(0)
  })
})

describe("trg_co_applicant_party_set — unstamped", () => {
  it("KNOWN-GOOD: adding a party to an unpriced application is not a void and not a refusal", async () => {
    const { appId } = await application("unstamped")
    const added = await addParty(appId)
    expect(added.error).toBeNull()
    expect(await stampOf(appId)).toMatchObject(CLEARED)
  })
})
