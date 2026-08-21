/**
 * lib/screening/searchworxBundle.ts — screening bundle composition, cost, fee and margin (SSOT)
 *
 * Data:   line-item costs IMPORTED from the live Searchworx product modules (the same constants
 *         bundle-runner charges); brief/legal/SEARCHWORX_RATE_CARD.md §1.1 is the commercial source
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
import { getApplicationFee } from "@/lib/constants"
// The LIVE per-call costs — the same constants lib/screening/bundle-runner.ts charges and writes to
// application_screening_lines.cost_cents. Imported, NEVER re-declared: an earlier version of this file
// restated 17000/635 as its own literals, which meant a bureau price rise could be applied to the live
// product modules while this file (and the below-cost test that reads it) stayed happily green. Deriving
// from the live values is what makes the margin guard actually load-bearing.
import { COMBINED_COST_CENTS, COMBINED_PRODUCT_KEY } from "@/lib/searchworx/products/combinedConsumerCreditReport"
import { VCCB_COST_CENTS, VCCB_PRODUCT_KEY } from "@/lib/searchworx/products/vccbIncomeEstimator"
import { SEARCHWORX_COSTS } from "@/lib/searchworx/costs"

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
    check_code: COMBINED_PRODUCT_KEY,
    cost_excl_vat_cents: COMBINED_COST_CENTS,
    fitscore_component: "credit_score",
    note: "Multi-bureau profile in ONE call — TransUnion + XDS + Experian Sigma + VeriCred (CompuScan + Experian non-Sigma when online). Carries Home Affairs verification, SAFPS fraud listing, dual Delphi scores, adverse listings + DebtReviewStatus + AlsoKnownAs, ConsumerDebtSummary.",
  },
  {
    check_code: VCCB_PRODUCT_KEY,
    cost_excl_vat_cents: VCCB_COST_CENTS,
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
  SEARCHWORX_BUNDLE_SA.filter((c) => c.check_code !== VCCB_PRODUCT_KEY)

/**
 * COMPANY-LEVEL bundle — the entity's own line on a juristic application. Rate card §2.1.
 *
 * ⛔ NOT IMPLEMENTED — the commercial application flow does not exist yet. There is no Compuscan Company
 * Profile product module (only cipcCompany / cipcDirector), nothing calls a company-level bundle, and no
 * code path writes a subject_type='company' screening line's RESULT. This lives here so the company
 * line's economics sit in the SAME SSOT as the consumer bundle — a company score is NOT priced like a
 * personal one (its cost is lower and its margin higher), and that difference must not get invented at
 * build time. Costs derive from SEARCHWORX_COSTS; the CIPC-director figure there currently CONTRADICTS
 * rate card §2.1, so the derived company margin is provisional until that is resolved.
 * See brief/build/OUTSTANDING.md § Commercial application flow.
 */
const SEARCHWORX_BUNDLE_COMPANY: readonly SearchworxCheck[] = [
  {
    check_code: "compuscan_company_profile",
    cost_excl_vat_cents: SEARCHWORX_COSTS.compuscan_company_profile,
    fitscore_component: "company_credit",
    note: "Company credit profile, business deeds, payment behaviour. NO product module exists yet.",
  },
  {
    check_code: "cipc_company",
    cost_excl_vat_cents: SEARCHWORX_COSTS.cipc_company,
    fitscore_component: null,
    note: "Company registration status verification.",
  },
  {
    check_code: "cipc_director",
    cost_excl_vat_cents: SEARCHWORX_COSTS.cipc_director,
    fitscore_component: null,
    note: "Returns registered directors — auto-discovers undeclared ones. Cost disputed vs rate card §2.1.",
  },
] as const

export function getSearchworxBundle(isForeignNational: boolean): readonly SearchworxCheck[] {
  return isForeignNational ? SEARCHWORX_BUNDLE_FOREIGN : SEARCHWORX_BUNDLE_SA
}

/** Company-line cost EXCLUDING VAT, derived. */
export function companyBundleCostExclVatCents(): number {
  return SEARCHWORX_BUNDLE_COMPANY.reduce((sum, c) => sum + c.cost_excl_vat_cents, 0)
}

/** Company-line cost INCLUDING VAT — what Pleks would pay for the entity's own check. */
export function companyBundleCostInclVatCents(): number {
  return Math.round(companyBundleCostExclVatCents() * (1 + VAT_RATE))
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

// `getApplicationFee` was re-exported here "for callers already holding this module". There were
// none — every caller imports it from lib/constants.ts, which is where it is defined. The
// convenience re-export was removed 2026-08-21; the import above stays, it feeds screeningMarginCents.

/**
 * How many bundles a given application consumes — a joint application screens BOTH applicants.
 * ⚠ This models the v2 AUTOMATED pipeline. Today runStandardBundle has ONE caller (the
 * screening-line-runner cron) reading v_application_screening_lines, whose branches are
 * entity_type='organisation' and application_co_applicants — neither covers a RESIDENTIAL primary
 * applicant, and BUILD_14 Phase 1 has agents running checks on their own Searchworx accounts. So the
 * margin figures here are the intended steady state, not what Pleks pays today.
 */
function bundlesPerApplication(isJoint: boolean): number {
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
