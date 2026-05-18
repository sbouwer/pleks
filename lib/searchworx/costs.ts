/**
 * lib/searchworx/costs.ts — Searchworx product wholesale cost rates (ADDENDUM_14H §6, v3 amendment §3.4)
 *
 * Notes:  Cost cents = wholesale ex-VAT. Retail cents set per-pull at purchase time.
 *         Update when Searchworx issues a revised rate card.
 *         Screening-bundle products: combined_consumer_credit_report + vccb_income_estimator.
 *         Property-intelligence products: deeds_search, lightstone_erf_short, cipc_company, cipc_director.
 */

export const SEARCHWORX_COSTS: Record<string, number> = {
  // ── Applicant screening bundle (ADDENDUM_14H v3) ───────────────────────────
  combined_consumer_credit_report: 17000, // R170.00 ex-VAT — multi-bureau TU+XDS+Sigma+VeriCred
  vccb_income_estimator:             635, // R6.35 ex-VAT — SA citizens only

  // ── Property intelligence (ADDENDUM_14A v2 rate card) ─────────────────────
  deeds_search:          2280,  // R22.80 ex-VAT
  lightstone_erf_short:  11700, // R117.00 ex-VAT
  cipc_company:          1565,  // R15.65 ex-VAT
  cipc_director:         2174,  // R21.74 ex-VAT (verify with John)
}
