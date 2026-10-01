/**
 * lib/screening/pricing.ts — the applicant fee formula over recorded vendor rates (ADDENDUM_14V §3.4)
 *
 * Data:   none — pure. The caller passes the current rates it read (lib/searchworx/rates/read.ts) and the
 *         policy (lib/screening/pricingPolicy.v1.ts).
 * Notes:  cost_excl = Σ entity-line rates + persons × Σ person-line rates; cost_incl adds VAT while Pleks is
 *         not VAT-registered; fee = band_nearest(cost_incl × (1 + margin) [× (1 − jointDiscount) if persons > 1]).
 *         Fail-closed (§4): a missing rate is no quote, never a zero or fallback fee — the ONLY refusal.
 *         FLOOR (ruled 2026-10-01): NEAREST banding can round down, so when it would land at or below cost_incl
 *         (cheap single-product pulls) the fee rounds UP to the first band multiple strictly above cost instead.
 *         fee > cost_incl therefore holds by construction, and the §5 test proves it over the rate table.
 */
import type { PricingPolicy } from "@/lib/screening/pricingPolicy.v1"

export interface CurrentRate {
  productKey: string
  costExclVatCents: number
  /** effective_date of the searchworx_rates row (YYYY-MM-DD). */
  effectiveDate: string
}

export type RateMap = ReadonlyMap<string, CurrentRate>

/** What one quote screens: the entity's own line (juristic only) plus `persons` natural-person lines. */
export interface PricingBundle {
  entityProducts: readonly string[]
  personProducts: readonly string[]
  persons: number
}

export type Quote =
  | {
      ok: true
      fee_cents: number
      cost_excl_cents: number
      cost_incl_cents: number
      /** The newest rate date among the rates used — the stamp a margin report joins on. */
      rate_effective_date: string
      pricing_policy_version: string
    }
  | { ok: false; reason: "no_rate"; missing: string[] }
  | { ok: false; reason: "empty_bundle" }

/** Round to the nearest multiple of `bandCents` (§9.1b — nearest, not up). */
export function band(cents: number, bandCents: number): number {
  return Math.round(cents / bandCents) * bandCents
}

/** The first multiple of `bandCents` strictly above `costIncl` — the floor when nearest lands at or below cost. */
function floorAboveCost(costIncl: number, bandCents: number): number {
  return (Math.floor(costIncl / bandCents) + 1) * bandCents
}

export function applicantFeeCents({
  bundle,
  rates,
  policy,
}: {
  bundle: PricingBundle
  rates: RateMap
  policy: Readonly<PricingPolicy>
}): Quote {
  const persons = Math.max(0, Math.trunc(bundle.persons))
  const used = [...bundle.entityProducts, ...(persons > 0 ? bundle.personProducts : [])]
  if (used.length === 0) return { ok: false, reason: "empty_bundle" }

  const missing = [...new Set(used)].filter((k) => !rates.has(k))
  if (missing.length > 0) return { ok: false, reason: "no_rate", missing }

  const sum = (keys: readonly string[]) => keys.reduce((s, k) => s + (rates.get(k) as CurrentRate).costExclVatCents, 0)
  const costExcl = sum(bundle.entityProducts) + persons * sum(bundle.personProducts)
  const costIncl = policy.pleksVatRegistered ? costExcl : Math.round(costExcl * (1 + policy.vatRate))

  const discount = persons > 1 ? 1 - policy.jointDiscount : 1
  const nearest = band(costIncl * (1 + policy.margin) * discount, policy.bandCents)
  const fee = nearest > costIncl ? nearest : floorAboveCost(costIncl, policy.bandCents)

  // ISO dates compare correctly as strings, so the max is a plain reduce.
  const rateDate = used
    .map((k) => (rates.get(k) as CurrentRate).effectiveDate)
    .reduce((a, b) => (b > a ? b : a), "")
  return {
    ok: true,
    fee_cents: fee,
    cost_excl_cents: costExcl,
    cost_incl_cents: costIncl,
    rate_effective_date: rateDate,
    pricing_policy_version: policy.version,
  }
}
