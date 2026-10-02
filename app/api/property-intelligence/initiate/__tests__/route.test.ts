/**
 * app/api/property-intelligence/initiate/__tests__/route.test.ts — a PI pull is quoted from recorded rates and stamped (ADDENDUM_14V step 7)
 *
 * Notes:  Probed both ways against fakeRateDb: the pull is inserted with the formula's fee as retail_cents, the
 *         rate cost as cost_cents and the three stamp columns, and the checkout form carries that same fee; no rate
 *         is a 503 that inserts nothing; a card that showed a different price gets a 409 carrying the new one and
 *         nothing is inserted or charged. forceRun skips the 30-day suppression read, which is not under test here.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { fakeRateDb, type Row } from "@/lib/searchworx/rates/__tests__/fakeRateDb"
import { PRICING_POLICY } from "@/lib/screening/pricingPolicy.v1"

let fake = fakeRateDb()
const chargeAdhoc = vi.fn()

vi.mock("@/lib/supabase/gateway", () => ({ gateway: async () => ({ db: fake.db, orgId: "org-1", userId: "u-1", tier: "steward" }) }))
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: async () => fake.db }))
vi.mock("@/lib/payfast/adhoc", () => ({ chargeAdhoc: (...a: unknown[]) => chargeAdhoc(...a) }))
vi.mock("@/lib/audit/recordAudit", () => ({ recordAudit: vi.fn() }))
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(), captureMessage: vi.fn() }))
vi.mock("@/lib/dates", async (orig) => ({ ...(await orig<typeof import("@/lib/dates")>()), saTodayISO: () => "2026-10-02" }))
vi.mock("@/lib/payfast/forms", () => ({
  buildPropertyIntelligenceFeeForm: (a: { retailCents: number }) => ({ url: "https://pf", data: { amount: (a.retailCents / 100).toFixed(2) } }),
}))

import { POST } from "../route"

const rate = (product_key: string, cost_excl_vat_cents: number): Row => ({
  product_key,
  cost_excl_vat_cents,
  effective_date: "2026-10-01",
  source: "pricelist_import",
})

const post = (extra: Row = {}) =>
  POST(new NextRequest("https://x/api/property-intelligence/initiate", {
    method: "POST",
    body: JSON.stringify({ productType: "cipc_company", subjectIdentifier: "2020/000001/07", forceRun: true, ...extra }),
  }))
const pulls = () => fake.tables.property_intelligence_pulls ?? []
/** The price the server quotes right now — what the card would have shown (a body with no quotedCents is a 409 carrying it). */
const shownPrice = async () => (await (await post()).json()).retailCents as number

beforeEach(() => {
  chargeAdhoc.mockReset()
  fake = fakeRateDb({ searchworx_rates: [rate("cipc_company", 1565)], organisation_payment_tokens: [] })
})

describe("POST /api/property-intelligence/initiate — quoted and stamped", () => {
  it("inserts the pull with the formula's fee, the rate cost and the three stamp columns; the form charges that fee", async () => {
    const res = await post({ quotedCents: await shownPrice() })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.mode).toBe("checkout")
    const [pull] = pulls()
    expect(pull.retail_cents).toBeGreaterThan(1565)
    expect((pull.retail_cents as number) % PRICING_POLICY.bandCents).toBe(0)
    expect(pull).toMatchObject({
      cost_cents: 1565,
      rate_effective_date: "2026-10-01",
      pricing_policy_version: PRICING_POLICY.version,
      cost_excl_vat_cents: 1565,
    })
    expect(body.data.amount).toBe(((pull.retail_cents as number) / 100).toFixed(2))
  })

  it("PLANTED: no rate for the product is a 503 that inserts nothing (fail closed)", async () => {
    fake = fakeRateDb({ searchworx_rates: [rate("deeds_search", 2280)], organisation_payment_tokens: [] })
    const res = await post()
    expect(res.status).toBe(503)
    expect(pulls()).toHaveLength(0)
  })

  it("PLANTED: a card that showed a different price gets a 409 with the new one — nothing inserted, nothing charged", async () => {
    fake.tables.organisation_payment_tokens.push({ org_id: "org-1", payfast_token: "tok", deleted_at: null, created_at: "2026-10-01" })
    const res = await post({ quotedCents: 1 })
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body).toMatchObject({ error: "price_changed" })
    expect(body.retailCents).toBeGreaterThan(1565)
    expect(pulls()).toHaveLength(0)
    expect(chargeAdhoc).not.toHaveBeenCalled()
  })

  it("PLANTED: a body with NO quotedCents (a tab from before the check) is a 409 — a saved card is never charged blind", async () => {
    fake.tables.organisation_payment_tokens.push({ org_id: "org-1", payfast_token: "tok", deleted_at: null, created_at: "2026-10-01" })
    const res = await post()
    expect(res.status).toBe(409)
    expect((await res.json()).retailCents).toBeGreaterThan(1565)
    expect(pulls()).toHaveLength(0)
    expect(chargeAdhoc).not.toHaveBeenCalled()
  })

  it("the price the card showed, when it still holds, is the price charged to a saved card", async () => {
    const shown = await shownPrice()
    fake = fakeRateDb({
      searchworx_rates: [rate("cipc_company", 1565)],
      organisation_payment_tokens: [{ org_id: "org-1", payfast_token: "tok", deleted_at: null, created_at: "2026-10-01" }],
    })
    chargeAdhoc.mockResolvedValue({ ok: true, payfastId: "pf-1" })
    const res = await post({ quotedCents: shown })
    expect(res.status).toBe(200)
    expect((await res.json()).mode).toBe("adhoc")
    expect(chargeAdhoc).toHaveBeenCalledWith("tok", shown, expect.any(String))
  })
})
