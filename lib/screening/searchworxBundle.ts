/**
 * lib/screening/searchworxBundle.ts — screening bundle COMPOSITION: which Searchworx products a subject runs and a quote prices (SSOT)
 *
 * Data:   product keys from the live Searchworx product modules; no costs and no fees
 * Notes:  Membership only. What a product COSTS is the recorded rate (searchworx_rates, ADDENDUM_14V) and what
 *         the applicant PAYS is quoted from it (lib/screening/quote.ts through lib/screening/pricing.ts). This
 *         module carried both until 14V step 7: line-item costs imported from the product modules, a
 *         SEARCHWORX_COSTS registry, VAT_RATE and a margin helper over the fixed R250/R470 fees. All retired —
 *         git history has them.
 *
 *         Composition is the half that stays load-bearing: bundle-runner asks getSearchworxBundle() what to
 *         RUN, the quote asks applicationBundle() what to PRICE, and lib/screening/__tests__/bundle-economics
 *         .test.ts asserts the formula never sells that composition below cost on any rate table.
 */
import { COMBINED_PRODUCT_KEY } from "@/lib/searchworx/products/combinedConsumerCreditReport"
import { VCCB_PRODUCT_KEY } from "@/lib/searchworx/products/vccbIncomeEstimator"
import type { PricingBundle } from "@/lib/screening/pricing"

export interface SearchworxCheck {
  check_code: string
  fitscore_component: string | null
  note: string
}

/** Standard bundle — every SA-citizen residential and commercial applicant. */
export const SEARCHWORX_BUNDLE_SA: readonly SearchworxCheck[] = [
  {
    check_code: COMBINED_PRODUCT_KEY,
    fitscore_component: "credit_score",
    note: "Multi-bureau profile in ONE call — TransUnion + XDS + Experian Sigma + VeriCred (CompuScan + Experian non-Sigma when online). Carries Home Affairs verification, SAFPS fraud listing, dual Delphi scores, adverse listings + DebtReviewStatus + AlsoKnownAs, ConsumerDebtSummary.",
  },
  {
    check_code: VCCB_PRODUCT_KEY,
    fitscore_component: "income_estimate",
    note: "Bureau-sourced income estimate — independent cross-check of declared income. SA citizens only.",
  },
] as const

/**
 * Foreign-national bundle. The VCCB income estimator is SA-citizens only, so a foreign applicant skips that
 * line; their income signal comes from ADDENDUM_14D bank-statement classification instead. Priced the same
 * either way (§9.5b) — the lower run cost is margin, never a second price.
 */
const SEARCHWORX_BUNDLE_FOREIGN: readonly SearchworxCheck[] =
  SEARCHWORX_BUNDLE_SA.filter((c) => c.check_code !== VCCB_PRODUCT_KEY)

/**
 * ADDENDUM_14V pricing shapes. What a quote PRICES, which can differ from what a pull RUNS:
 *   · every natural person is priced on the SA bundle, foreign or not (§9.5b — the foreign bundle's lower
 *     cost is margin, never a second price);
 *   · the entity line is the two BILLED company products. CIPC Director is not in it: unbilled, and the
 *     board arrives with the company result (the 2026-10-01 billing report, recorded as
 *     searchworx_rates source=billing_report by the first rate sync).
 */
export const ENTITY_LINE_PRODUCT_KEYS: readonly string[] = ["compuscan_company_profile", "cipc_company"]

export function applicationBundle({ juristic, persons }: { juristic: boolean; persons: number }): PricingBundle {
  return {
    entityProducts: juristic ? ENTITY_LINE_PRODUCT_KEYS : [],
    personProducts: SEARCHWORX_BUNDLE_SA.map((c) => c.check_code),
    persons,
  }
}

/** A one-product quote — property-intelligence pulls (§3.4 last bullet). */
export function singleProductBundle(productKey: string): PricingBundle {
  return { entityProducts: [productKey], personProducts: [], persons: 0 }
}

export function getSearchworxBundle(isForeignNational: boolean): readonly SearchworxCheck[] {
  return isForeignNational ? SEARCHWORX_BUNDLE_FOREIGN : SEARCHWORX_BUNDLE_SA
}
