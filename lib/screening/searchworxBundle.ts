/**
 * lib/screening/searchworxBundle.ts — screening bundle composition, cost, fee and margin (SSOT)
 *
 * Data:   line-item costs transcribed from brief/legal/SEARCHWORX_RATE_CARD.md §1.1 (amended 2026-05-18)
 * Notes:  THE one place the screening economics are stated. Totals are DERIVED, never transcribed —
 *         the previous version carried hand-maintained BUNDLE_COST_* constants with a header asking
 *         future editors to "keep them in sync when checks change", and they duly went stale.
 *
 *         It encoded the PRE-2026-05-18 composition: individual bureau products (TransUnion + XDS +
 *         CSI ID + CSI photo + Default Listing + Judgement) totalling R269.45 ex-VAT. That bundle no
 *         longer exists — the 2026-05-18 amendment collapsed it into ONE Combined Consumer Credit
 *         Report call, and Default Listing Consumer Combined was retired permanently (its rental-history
 *         signal now comes from ADDENDUM_14D bank-statement classification + ADDENDUM_14K internal
 *         history). Nothing imported this file, so the drift was invisible — and on 2026-08-14 it caused
 *         a live analysis to conclude the R250 fee was BELOW cost. It is not: cost is R202.80.
 *
 *         Guarded by lib/screening/__tests__/bundle-economics.test.ts, which asserts the derived totals
 *         still equal the rate card's published figures and that no bundle is ever sold below cost.
 *         If a line item changes, that test fails and the rate card must be amended in the same change.
 */
import { APPLICATION_FEE_CENTS, JOINT_APPLICATION_FEE_CENTS } from "@/lib/constants"

/** SA VAT. Pleks pays input VAT on Searchworx invoices; see rate-card §3 for the registration scenarios. */
export const VAT_RATE = 0.15

export interface SearchworxCheck {
  check_code: string
  /** Rate-card line-item cost, EXCLUDING VAT, in cents. */
  cost_excl_vat_cents: number
  fitscore_component: string | null
  note: string
}

/** Standard bundle — every SA-citizen residential and commercial application. Rate card §1.1. */
export const SEARCHWORX_BUNDLE_SA: readonly SearchworxCheck[] = [
  {
    check_code: "COMBINED_CONSUMER_CREDIT_REPORT",
    cost_excl_vat_cents: 17000, // R170.00
    fitscore_component: "credit_score",
    note: "Multi-bureau profile in ONE call — TransUnion + XDS + Experian Sigma + VeriCred (CompuScan + Experian non-Sigma when online). Carries Home Affairs verification, SAFPS fraud listing, dual Delphi scores, adverse listings + DebtReviewStatus + AlsoKnownAs, ConsumerDebtSummary.",
  },
  {
    check_code: "VCCB_INCOME_ESTIMATOR",
    cost_excl_vat_cents: 635, // R6.35
    fitscore_component: "income_estimate",
    note: "Bureau-sourced income estimate — independent cross-check of declared income. SA citizens only.",
  },
] as const

/**
 * Foreign-national bundle. Per rate-card §1.1 the VCCB income estimator is SA-citizens only, so a
 * foreign applicant skips that line; their income signal comes from ADDENDUM_14D bank-statement
 * classification instead. Same fee is charged either way — no differentiation in the applicant UI.
 */
export const SEARCHWORX_BUNDLE_FOREIGN: readonly SearchworxCheck[] =
  SEARCHWORX_BUNDLE_SA.filter((c) => c.check_code !== "VCCB_INCOME_ESTIMATOR")

export function getSearchworxBundle(isForeignNational: boolean): readonly SearchworxCheck[] {
  return isForeignNational ? SEARCHWORX_BUNDLE_FOREIGN : SEARCHWORX_BUNDLE_SA
}

export function getRequiredChecks(isForeignNational: boolean): string[] {
  return getSearchworxBundle(isForeignNational).map((c) => c.check_code)
}

/** Bundle cost EXCLUDING VAT, derived from the line items. */
export function bundleCostExclVatCents(isForeignNational: boolean): number {
  return getSearchworxBundle(isForeignNational).reduce((sum, c) => sum + c.cost_excl_vat_cents, 0)
}

/** Bundle cost INCLUDING VAT — what Pleks actually pays Searchworx. Rounded to the cent. */
export function bundleCostInclVatCents(isForeignNational: boolean): number {
  return Math.round(bundleCostExclVatCents(isForeignNational) * (1 + VAT_RATE))
}

/** What the applicant pays. Joint applications carry two bundles at a small joint discount. */
export function getApplicationFee(isJoint: boolean): number {
  return isJoint ? JOINT_APPLICATION_FEE_CENTS : APPLICATION_FEE_CENTS
}

/** How many bundles a given application consumes — a joint application screens BOTH applicants. */
export function bundlesPerApplication(isJoint: boolean): number {
  return isJoint ? 2 : 1
}

/**
 * Pleks's gross margin on one application, in cents. Negative means the bundle is sold below cost —
 * the condition the economics test exists to prevent shipping.
 */
export function screeningMarginCents(isJoint: boolean, isForeignNational = false): number {
  const cost = bundleCostInclVatCents(isForeignNational) * bundlesPerApplication(isJoint)
  return getApplicationFee(isJoint) - cost
}
