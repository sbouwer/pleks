/**
 * app/api/billing/screening/__tests__/route.test.ts — the screening fee is quoted from recorded rates and stamped once (ADDENDUM_14V §3.5)
 *
 * Notes:  Probed both ways against fakeRateDb: the first POST quotes the formula over searchworx_rates and writes
 *         the fee with its three stamp columns; a second POST after the rates have moved REUSES the stamp; no rate
 *         is a 503 that writes nothing (fail closed, §4); a row that someone else stamped first is re-read, never
 *         overwritten. The PayFast form builder is stubbed — this file probes the price, not the form.
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

const application = (over: Row = {}): Row => ({
  id: "app-1",
  org_id: "org-1",
  listing_id: "lst-1",
  has_co_applicant: false,
  entity_type: null,
  applicant_type: "individual",
  company_info: null,
  fee_amount_cents: null,
  pricing_policy_version: null,
  rate_effective_date: null,
  cost_excl_vat_cents: null,
  listings: { asking_rent_cents: 1000000, units: { unit_number: "1" }, properties: { name: "P" } },
  ...over,
})

function seed(app: Row, rates: Row[]) {
  fake = fakeRateDb({
    application_tokens: [{ token: "tok", token_type: "shortlist_invite", application_id: "app-1", applicant_email: "x", expires_at: "2099-01-01T00:00:00Z" }],
    applications: [app],
    searchworx_rates: rates,
  })
}

const post = () => POST(new NextRequest("https://x/api/billing/screening", { method: "POST", body: JSON.stringify({ token: "tok" }) }))
const row = () => fake.tables.applications[0]

beforeEach(() => seed(application(), [rate("combined_consumer_credit_report", 19410), rate("vccb_income_estimator", 715)]))

describe("POST /api/billing/screening — stamp at first show", () => {
  it("the first POST quotes the formula and stamps the fee with its three columns", async () => {
    const res = await post()
    expect(res.status).toBe(200)
    const { fee_cents } = await res.json()
    expect(fee_cents).toBeGreaterThan(0)
    expect(fee_cents % PRICING_POLICY.bandCents).toBe(0)
    expect(row()).toMatchObject({
      fee_amount_cents: fee_cents,
      rate_effective_date: "2026-10-01",
      pricing_policy_version: PRICING_POLICY.version,
      cost_excl_vat_cents: 19410 + 715,
    })
  })

  it("a later POST REUSES the stamp after the rates move — an open payment is never repriced", async () => {
    const first = (await (await post()).json()).fee_cents
    fake.tables.searchworx_rates.push(rate("combined_consumer_credit_report", 50000, "2026-10-02"))
    const again = await (await post()).json()
    expect(again.fee_cents).toBe(first)
    expect(row().cost_excl_vat_cents).toBe(19410 + 715)
  })

  it("PLANTED: no rate for a bundle product is a 503 that writes nothing (fail closed)", async () => {
    seed(application(), [rate("combined_consumer_credit_report", 19410)])
    const res = await post()
    expect(res.status).toBe(503)
    expect(await res.json()).toMatchObject({ reason: "no_rate" })
    expect(row()).toMatchObject({ fee_amount_cents: null, pricing_policy_version: null })
  })

  it("a stamp already on the row is returned as-is, even with no rates at all", async () => {
    seed(application({ fee_amount_cents: 32500, pricing_policy_version: "v1-test", rate_effective_date: "2026-09-01" }), [])
    const res = await post()
    expect(res.status).toBe(200)
    expect((await res.json()).fee_cents).toBe(32500)
  })

  it("a joint application is priced for two people", async () => {
    const single = (await (await post()).json()).fee_cents
    seed(application({ has_co_applicant: true }), [rate("combined_consumer_credit_report", 19410), rate("vccb_income_estimator", 715)])
    const joint = (await (await post()).json()).fee_cents
    expect(joint).toBeGreaterThan(single)
    expect(row()).toMatchObject({ joint_fee_paid: true, cost_excl_vat_cents: 2 * (19410 + 715) })
  })
})
