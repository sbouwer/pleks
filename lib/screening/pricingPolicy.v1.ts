/**
 * lib/screening/pricingPolicy.v1.ts — the screening pricing policy: the ONLY file with pricing literals (ADDENDUM_14V §3.4)
 *
 * Data:   values ruled by Stéan 2026-10-01 (DECISIONS.md 2026-10-01; ADDENDUM_14V §9). VAT rate read from
 *         lib/finance/vatCalculation.ts (SA_VAT_RATE), the finance SSOT — not restated here.
 * Notes:  A new value is a new version (pricingPolicy.v2.ts), never an edit: a quoted fee is stamped with
 *         `version`, and a stamp pointing at a file whose numbers have since changed is worthless (§3.5).
 *         Vendor COSTS never live here — they are rows in searchworx_rates. This file holds only how a
 *         cost becomes a fee.
 */
import { SA_VAT_RATE } from "@/lib/finance/vatCalculation"

const PRICING_POLICY_VERSION = "pricing-policy.v1"

export interface PricingPolicy {
  version: string
  /** Fee = cost incl VAT × (1 + margin), before banding. */
  margin: number
  /** The fee is banded to a multiple of this. */
  bandCents: number
  rounding: "nearest"
  /** Applied to a multi-person application's fee; 0 = the fee scales linearly with persons (§9.3). */
  jointDiscount: number
  /** Every natural person is priced on this bundle, whatever their own bundle costs (§9.5b). */
  naturalPersonBundle: "SA"
  /** While false, cost incl VAT is the real cost; when true, input VAT is claimable (rate card §3). */
  pleksVatRegistered: boolean
  vatRate: number
  /** The cron HOLDS a vendor-price move larger than this, and alerts (§3.3 step 4). */
  plausibilityThresholdPct: number
  /** A rate with no observation for longer than this warns on every cron run (§3.3 step 5). */
  staleAfterDays: number
}

export const PRICING_POLICY: Readonly<PricingPolicy> = Object.freeze({
  version: PRICING_POLICY_VERSION,
  margin: 0.23,
  bandCents: 2500,
  rounding: "nearest",
  jointDiscount: 0,
  naturalPersonBundle: "SA",
  pleksVatRegistered: false,
  vatRate: SA_VAT_RATE,
  plausibilityThresholdPct: 25,
  staleAfterDays: 400,
})

// §4: an unresolved policy input throws at module load, never at quote time.
for (const [k, v] of Object.entries(PRICING_POLICY)) {
  if (v === undefined || v === null || (typeof v === "number" && !Number.isFinite(v))) {
    throw new Error(`pricingPolicy.v1: ${k} is unresolved — refusing to load a policy that cannot price`)
  }
}
