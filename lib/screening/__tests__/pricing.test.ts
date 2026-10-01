/**
 * lib/screening/__tests__/pricing.test.ts — ADDENDUM_14V §5: the fee formula, its banding and its invariant
 *
 * Notes:  Probe-first, both directions. The invariant (fee > cost incl VAT) is asserted over every rate row
 *         in the fixture table, never assumed from the margin: nearest-banding can round down, so a cheap
 *         enough bundle CAN land at or below cost, and the FLOOR (ruled 2026-10-01) rounds it up to the first
 *         band strictly above cost rather than sell it at a loss or refuse it.
 *         The fixture is the billed cost basis (the 2026-10-01 billing report, recorded in prod
 *         searchworx_rates as source=billing_report by the first rate sync) plus the 2026-10-01 Default list
 *         ceiling for the same products.
 */
import { describe, expect, it } from "vitest"
import { applicantFeeCents, band, type RateMap } from "@/lib/screening/pricing"
import { PRICING_POLICY } from "@/lib/screening/pricingPolicy.v1"
import { applicationBundle, singleProductBundle } from "@/lib/screening/searchworxBundle"

function rates(cents: Record<string, number>, effectiveDate = "2026-10-01"): RateMap {
  return new Map(Object.entries(cents).map(([k, v]) => [k, { productKey: k, costExclVatCents: v, effectiveDate }]))
}

// As billed on /billingreports/company/ for 2026-10-01 (prod searchworx_rates, billing_report) and the Default list ceiling (§9.6).
const BILLED = rates({ combined_consumer_credit_report: 17000, vccb_income_estimator: 635, compuscan_company_profile: 11000, cipc_company: 1565 })
const LIST = rates({ combined_consumer_credit_report: 19410, vccb_income_estimator: 715, compuscan_company_profile: 12980, cipc_company: 1770 })

function fee(r: RateMap, juristic: boolean, persons: number) {
  const q = applicantFeeCents({ bundle: applicationBundle({ juristic, persons }), rates: r, policy: PRICING_POLICY })
  if (!q.ok) throw new Error(`no quote: ${q.reason}`)
  return q
}

describe("band (nearest)", () => {
  it("rounds to the NEAREST band, down as well as up", () => {
    expect(band(24944, 2500)).toBe(25000)
    expect(band(17774, 2500)).toBe(17500)
    expect(band(42718, 2500)).toBe(42500)
  })
  it("|band(x) − x| ≤ bandCents / 2 for every x", () => {
    for (let x = 0; x <= 100_000; x += 37) expect(Math.abs(band(x, 2500) - x)).toBeLessThanOrEqual(1250)
  })
})

describe("the ruled worked figures (23%, R25 nearest, billed cost)", () => {
  it.each([
    [false, 1, 25000],
    [false, 2, 50000],
    [true, 0, 17500],
    [true, 1, 42500],
    [true, 2, 67500],
  ])("juristic=%s persons=%i → %i", (juristic, persons, expected) => {
    expect(fee(BILLED, juristic, persons).fee_cents).toBe(expected)
  })

  it("stamps the policy version and the rate date it was computed from", () => {
    const q = fee(BILLED, false, 1)
    expect(q.pricing_policy_version).toBe("pricing-policy.v1")
    expect(q.rate_effective_date).toBe("2026-10-01")
    expect(q.cost_excl_cents).toBe(17635)
    expect(q.cost_incl_cents).toBe(20280)
  })

  it("the rate date is the NEWEST rate the quote used", () => {
    const mixed = new Map(BILLED)
    mixed.set("vccb_income_estimator", { productKey: "vccb_income_estimator", costExclVatCents: 635, effectiveDate: "2026-11-15" })
    expect(fee(mixed, false, 1).rate_effective_date).toBe("2026-11-15")
  })
})

describe("§5 invariant: fee > cost incl VAT over every rate row", () => {
  it("holds for every application shape on every fixture table", () => {
    for (const table of [BILLED, LIST]) {
      for (const juristic of [false, true]) {
        for (let persons = juristic ? 0 : 1; persons <= 6; persons++) {
          const q = fee(table, juristic, persons)
          expect(q.fee_cents, `juristic=${juristic} persons=${persons}`).toBeGreaterThan(q.cost_incl_cents)
        }
      }
    }
  })

  // FLOOR (ruled 2026-10-01): where nearest would land at or below cost, the band rounds UP to the first
  // multiple strictly above cost — the formula never refuses a priced line.
  it("FLOOR: nearest landing BELOW cost rounds up to the first band above cost", () => {
    const cheap = rates({ deeds_search: 800 }) // R9.20 incl → ×1.23 = R11.32 → nearest R0 → floor R25
    const q = applicantFeeCents({ bundle: singleProductBundle("deeds_search"), rates: cheap, policy: PRICING_POLICY })
    expect(q).toMatchObject({ ok: true, fee_cents: 2500, cost_incl_cents: 920 })
  })

  it("FLOOR: nearest landing EXACTLY on cost rounds up too — the invariant is strict", () => {
    const atCost = rates({ deeds_search: 4348 }) // R50.00 incl → ×1.23 = R61.50 → nearest R50.00 → floor R75
    const q = applicantFeeCents({ bundle: singleProductBundle("deeds_search"), rates: atCost, policy: PRICING_POLICY })
    expect(q).toMatchObject({ ok: true, fee_cents: 7500, cost_incl_cents: 5000 })
  })

  it("fee > cost incl VAT for EVERY single-product cost from R0.01 to R300 — the floor leaves no gap", () => {
    for (let c = 1; c <= 30_000; c += 7) {
      const q = applicantFeeCents({ bundle: singleProductBundle("p"), rates: rates({ p: c }), policy: PRICING_POLICY })
      if (!q.ok) throw new Error(`no quote at ${c}`)
      expect(q.fee_cents, `cost_excl=${c}`).toBeGreaterThan(q.cost_incl_cents)
      expect(q.fee_cents % 2500).toBe(0)
    }
  })

  it("KNOWN-GOOD: the cheapest single product that clears banding quotes", () => {
    const ok = rates({ deeds_search: 1565 }) // R18.00 incl → ×1.23 = R22.14 → R25
    const q = applicantFeeCents({ bundle: singleProductBundle("deeds_search"), rates: ok, policy: PRICING_POLICY })
    expect(q).toMatchObject({ ok: true, fee_cents: 2500 })
  })

})

describe("§4 fail-closed", () => {
  it("a product with no rate → no quote, naming the product; never a zero fee", () => {
    const partial = rates({ combined_consumer_credit_report: 17000 })
    const q = applicantFeeCents({ bundle: applicationBundle({ juristic: false, persons: 1 }), rates: partial, policy: PRICING_POLICY })
    expect(q).toEqual({ ok: false, reason: "no_rate", missing: ["vccb_income_estimator"] })
  })

  it("KNOWN-GOOD: a full rate set quotes", () => {
    expect(fee(BILLED, false, 1).fee_cents).toBeGreaterThan(0)
  })

  it("an application that screens nobody is not a quote", () => {
    const q = applicantFeeCents({ bundle: applicationBundle({ juristic: false, persons: 0 }), rates: BILLED, policy: PRICING_POLICY })
    expect(q).toMatchObject({ ok: false, reason: "empty_bundle" })
  })
})

describe("policy flags change the arithmetic, not the code", () => {
  it("VAT-registered: cost incl = cost excl", () => {
    const q = applicantFeeCents({
      bundle: applicationBundle({ juristic: false, persons: 1 }),
      rates: BILLED,
      policy: { ...PRICING_POLICY, pleksVatRegistered: true },
    })
    expect(q).toMatchObject({ ok: true, cost_incl_cents: 17635 })
  })

  it("jointDiscount applies to a multi-person application only", () => {
    const policy = { ...PRICING_POLICY, jointDiscount: 0.1 }
    const one = applicantFeeCents({ bundle: applicationBundle({ juristic: false, persons: 1 }), rates: BILLED, policy })
    const two = applicantFeeCents({ bundle: applicationBundle({ juristic: false, persons: 2 }), rates: BILLED, policy })
    expect(one).toMatchObject({ ok: true, fee_cents: 25000 })
    expect(two).toMatchObject({ ok: true, fee_cents: 45000 }) // 40561 × 1.23 × 0.9 = 44901 → 45000
  })
})
