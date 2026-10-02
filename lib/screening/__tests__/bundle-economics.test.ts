/**
 * lib/screening/__tests__/bundle-economics.test.ts — no screening bundle is ever sold below cost, on any rate table
 *
 * Notes:  A PROPERTY test over the real composition (applicationBundle, the same shape quote.ts prices) and the
 *         real formula + policy. It replaced the fixed-figure economics test in ADDENDUM_14V step 7: that one
 *         asserted R250 > R202.80 against transcribed rate-card totals, which proved one price against one cost
 *         and nothing once the fee became a quote over recorded rates that move. Here the rates are generated —
 *         seeded, so a failure reproduces — from R0.01 to R500 per product, and the invariant must hold for
 *         every application shape on every table: fee > cost incl VAT, banded, stamped.
 *
 *         Composition facts are asserted beside it, because a bundle that changes membership changes what the
 *         invariant is about: Default Listing stays retired, foreign nationals RUN without VCCB but are PRICED
 *         on the SA bundle (§9.5b), and the entity line is the two billed company products, never CIPC Director.
 */
import { describe, expect, it } from "vitest"
import { applicantFeeCents, type RateMap } from "@/lib/screening/pricing"
import { PRICING_POLICY } from "@/lib/screening/pricingPolicy.v1"
import {
  applicationBundle,
  ENTITY_LINE_PRODUCT_KEYS,
  getSearchworxBundle,
  SEARCHWORX_BUNDLE_SA,
  singleProductBundle,
} from "@/lib/screening/searchworxBundle"
import { COMBINED_PRODUCT_KEY } from "@/lib/searchworx/products/combinedConsumerCreditReport"
import { VCCB_PRODUCT_KEY } from "@/lib/searchworx/products/vccbIncomeEstimator"

// mulberry32 — a fixed seed makes every generated table reproducible from the failure message.
function prng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const PRODUCTS = [...new Set([...SEARCHWORX_BUNDLE_SA.map((c) => c.check_code), ...ENTITY_LINE_PRODUCT_KEYS])]

function randomTable(rand: () => number): RateMap {
  return new Map(PRODUCTS.map((k) => [k, { productKey: k, costExclVatCents: 1 + Math.floor(rand() * 50000), effectiveDate: "2026-10-01" }]))
}

describe("the invariant: fee > cost incl VAT, for every shape, on every generated rate table", () => {
  it("holds across 500 seeded tables × every application shape", () => {
    const rand = prng(14_7)
    for (let t = 0; t < 500; t++) {
      const rates = randomTable(rand)
      for (const juristic of [false, true]) {
        for (let persons = juristic ? 0 : 1; persons <= 6; persons++) {
          const q = applicantFeeCents({ bundle: applicationBundle({ juristic, persons }), rates, policy: PRICING_POLICY })
          const at = `table=${t} juristic=${juristic} persons=${persons}`
          expect(q.ok, at).toBe(true)
          if (!q.ok) continue
          expect(q.fee_cents, at).toBeGreaterThan(q.cost_incl_cents)
          expect(q.fee_cents % PRICING_POLICY.bandCents, at).toBe(0)
          expect(q.pricing_policy_version, at).toBe(PRICING_POLICY.version)
        }
      }
    }
  })

  it("holds for every single-product (property intelligence) quote on the same tables", () => {
    const rand = prng(14_8)
    for (let t = 0; t < 200; t++) {
      const rates = randomTable(rand)
      for (const k of PRODUCTS) {
        const q = applicantFeeCents({ bundle: singleProductBundle(k), rates, policy: PRICING_POLICY })
        expect(q.ok && q.fee_cents > q.cost_incl_cents, `table=${t} product=${k}`).toBe(true)
      }
    }
  })

  it("KNOWN-BAD: a table missing a priced product is no quote, never a zero or a guess", () => {
    const rates: RateMap = new Map([...randomTable(prng(1))].filter(([k]) => k !== VCCB_PRODUCT_KEY))
    const q = applicantFeeCents({ bundle: applicationBundle({ juristic: false, persons: 1 }), rates, policy: PRICING_POLICY })
    expect(q).toMatchObject({ ok: false, reason: "no_rate", missing: [VCCB_PRODUCT_KEY] })
  })
})

describe("the composition the invariant is about", () => {
  it("runs the post-2026-05-18 Combined call plus VCCB — Default Listing stays retired", () => {
    expect(getSearchworxBundle(false).map((c) => c.check_code)).toEqual([COMBINED_PRODUCT_KEY, VCCB_PRODUCT_KEY])
    expect(getSearchworxBundle(false).map((c) => c.check_code)).not.toContain("default_listing_consumer_combined")
  })

  it("a foreign national RUNS without VCCB but is PRICED on the SA bundle (§9.5b)", () => {
    expect(getSearchworxBundle(true).map((c) => c.check_code)).toEqual([COMBINED_PRODUCT_KEY])
    expect(applicationBundle({ juristic: false, persons: 1 }).personProducts).toEqual([COMBINED_PRODUCT_KEY, VCCB_PRODUCT_KEY])
  })

  it("the entity line is the two billed company products — never CIPC Director", () => {
    expect(applicationBundle({ juristic: true, persons: 0 }).entityProducts).toEqual(["compuscan_company_profile", "cipc_company"])
    expect(applicationBundle({ juristic: true, persons: 2 }).entityProducts).not.toContain("cipc_director")
    expect(applicationBundle({ juristic: false, persons: 2 }).entityProducts).toEqual([])
  })
})
