/**
 * app/api/billing/screening/__tests__/route.test.ts — the lead pays for their OWN line, after their own consent (ADDENDUM_14W §0)
 *
 * Notes:  Probed both ways against fakeRateDb. The form prices ONE line — one natural person, or the company's entity
 *         products on a juristic application — and stamps it on that line's own application_screening_payments row
 *         (14V §3.5, stamp at first show): a second POST after the rates move REUSES the stamp; no rate is a 503 that
 *         writes nothing; a row stamped first by a concurrent show is re-read, never overwritten.
 *         Consent first, per line: no form and no stamp before the lead's own stage-2 consent — and NOBODY ELSE's
 *         consent or payment is a condition, which is what retired the pooled model's gate. `applications` is never
 *         written. The PayFast form builder is stubbed — this file probes the price, not the form.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { fakeRateDb, type Row } from "@/lib/searchworx/rates/__tests__/fakeRateDb"
import { PRICING_POLICY } from "@/lib/screening/pricingPolicy.v1"

let fake = fakeRateDb()

vi.mock("@/lib/supabase/server", () => ({ createServiceClient: async () => fake.db }))
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(), captureMessage: vi.fn() }))
vi.mock("@/lib/dates", async (orig) => ({ ...(await orig<typeof import("@/lib/dates")>()), saTodayISO: () => "2026-10-02" }))
vi.mock("@/lib/payfast/forms", () => ({
  buildApplicationFeeForm: (a: { feeCents: number }) => ({ url: "https://pf", data: { amount: (a.feeCents / 100).toFixed(2) } }),
}))

import { POST } from "../route"

const rate = (product_key: string, cost_excl_vat_cents: number, effective_date = "2026-10-01"): Row => ({
  product_key,
  cost_excl_vat_cents,
  effective_date,
  source: "pricelist_import",
})

const PERSON_RATES = [rate("combined_consumer_credit_report", 19410), rate("vccb_income_estimator", 715)]
const ENTITY_RATES = [rate("compuscan_company_profile", 9000), rate("cipc_company", 3000)]

const application = (over: Row = {}): Row => ({
  id: "app-1",
  org_id: "org-1",
  listing_id: "lst-1",
  entity_type: "individual",
  applicant_type: "individual",
  company_info: null,
  stage2_consent_given_at: "2026-10-01T09:00:00Z",
  fee_paid_at: null,
  listings: { asking_rent_cents: 1000000, units: { unit_number: "1" }, properties: { name: "P" } },
  ...over,
})
const COMPANY = { entity_type: "organisation", applicant_type: "company", company_info: { companyType: "pty_ltd" } }

const coRow = (id: string, over: Row = {}): Row => ({
  id, org_id: "org-1", primary_application_id: "app-1", declined_at: null, stage2_consent_given_at: null, ...over,
})

function seed(app: Row, rates: Row[], extra: Record<string, Row[]> = {}) {
  fake = fakeRateDb({
    application_tokens: [{ token: "tok", token_type: "shortlist_invite", application_id: "app-1", applicant_email: "x", expires_at: "2099-01-01T00:00:00Z" }],
    applications: [app],
    searchworx_rates: rates,
    application_screening_payments: [],
    ...extra,
  })
}

const post = () => POST(new NextRequest("https://x/api/billing/screening", { method: "POST", body: JSON.stringify({ token: "tok" }) }))
const lines = () => fake.tables.application_screening_payments

beforeEach(() => seed(application(), PERSON_RATES))

describe("POST /api/billing/screening — the lead's own line, stamped at first show", () => {
  it("prices ONE person and stamps it on the lead's `applicant` line with its three columns", async () => {
    const res = await post()
    expect(res.status).toBe(200)
    const { fee_cents } = await res.json()
    expect(fee_cents).toBeGreaterThan(0)
    expect(fee_cents % PRICING_POLICY.bandCents).toBe(0)
    expect(lines()).toHaveLength(1)
    expect(lines()[0]).toMatchObject({
      org_id: "org-1", application_id: "app-1", subject_type: "applicant", subject_id: "app-1",
      fee_cents, rate_effective_date: "2026-10-01", pricing_policy_version: PRICING_POLICY.version, cost_excl_vat_cents: 19410 + 715,
    })
    expect(lines()[0].paid_at ?? null).toBeNull()
  })

  it("a juristic application's form is the COMPANY line — the entity products only, no person priced", async () => {
    seed(application(COMPANY), [...PERSON_RATES, ...ENTITY_RATES])
    const res = await post()
    expect(res.status).toBe(200)
    expect(lines()).toHaveLength(1)
    expect(lines()[0]).toMatchObject({ subject_type: "company", subject_id: "app-1", cost_excl_vat_cents: 9000 + 3000 })
  })

  it("a later POST REUSES the stamp after the rates move — an open payment is never repriced", async () => {
    const first = (await (await post()).json()).fee_cents
    fake.tables.searchworx_rates.push(rate("combined_consumer_credit_report", 50000, "2026-10-02"))
    const again = await (await post()).json()
    expect(again.fee_cents).toBe(first)
    expect(lines()).toHaveLength(1)
    expect(lines()[0].cost_excl_vat_cents).toBe(19410 + 715)
  })

  it("PLANTED: no rate for a bundle product is a 503 that writes nothing (fail closed)", async () => {
    seed(application(), [rate("combined_consumer_credit_report", 19410)])
    const res = await post()
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ reason: "rates_unavailable" })
    expect(lines()).toHaveLength(0)
  })

  it("a stamp already on the line is returned as-is, even with no rates at all", async () => {
    seed(application(), [], { application_screening_payments: [
      { id: "l1", org_id: "org-1", application_id: "app-1", subject_type: "applicant", subject_id: "app-1", fee_cents: 32500, pricing_policy_version: "v1-test", paid_at: null },
    ] })
    const res = await post()
    expect(res.status).toBe(200)
    expect((await res.json()).fee_cents).toBe(32500)
  })

  it("PLANTED: a PAID line is a 409 — never re-quoted, no second form", async () => {
    seed(application(), PERSON_RATES, { application_screening_payments: [
      { id: "l1", org_id: "org-1", application_id: "app-1", subject_type: "applicant", subject_id: "app-1", fee_cents: 25000, pricing_policy_version: "v1-test", paid_at: "2026-10-01T10:00:00Z" },
    ] })
    const res = await post()
    expect(res.status).toBe(409)
    expect(await res.json()).not.toHaveProperty("payfast_url")
    expect(lines()[0].fee_cents).toBe(25000)
  })

  it("PLANTED: an application paid under the pooled form (fee_paid_at) is a 409, with no line written", async () => {
    seed(application({ fee_paid_at: "2026-09-30T10:00:00Z" }), PERSON_RATES)
    expect((await post()).status).toBe(409)
    expect(lines()).toHaveLength(0)
  })

  it("never writes `applications` — the fee lives on the line", async () => {
    const before = { ...fake.tables.applications[0] }
    await post()
    expect(fake.tables.applications[0]).toEqual(before)
  })
})

describe("POST /api/billing/screening — consent first, per line (14W §0)", () => {
  it("PLANTED: the lead has not consented → 409 awaiting_consent, no form, nothing stamped", async () => {
    seed(application({ stage2_consent_given_at: null }), PERSON_RATES)
    const res = await post()
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body).toMatchObject({ reason: "awaiting_consent" })
    expect(body).not.toHaveProperty("payfast_url")
    expect(lines()).toHaveLength(0)
  })

  it("KNOWN-GOOD: a co-applicant who has NOT consented is no condition — the lead pays their own line now", async () => {
    seed(application(), PERSON_RATES, { application_co_applicants: [coRow("co-1"), coRow("co-2")] })
    const res = await post()
    expect(res.status).toBe(200)
    expect(await res.json()).toHaveProperty("payfast_url")
    expect(lines().map((l) => l.subject_type)).toEqual(["applicant"])
    expect(lines()[0].cost_excl_vat_cents).toBe(19410 + 715)
  })
})
