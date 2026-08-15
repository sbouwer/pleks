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
  // ⚠ DISAGREES WITH THE RATE CARD. SEARCHWORX_RATE_CARD.md §2.1 prices CIPC Director Search at
  // R15.65; this says R21.74 and has carried "(verify with John)" since it was written. The commercial
  // subtotal in §2.1 (R141.30 ex-VAT → R162.50 incl → R87.50/35% margin) is computed with R15.65, so if
  // R21.74 is correct the real commercial margin is R80.50 (32%), not R87.50. UNRESOLVED — see
  // brief/build/OUTSTANDING.md § Commercial application flow. Do not "fix" either side by guessing.
  cipc_director:         2174,  // R21.74 ex-VAT (verify with John — conflicts with rate card §2.1)

  // ── Commercial / company-level screening (rate card §2.1) ─────────────────
  // ⛔ NOT IMPLEMENTED. There is no product module for this — lib/searchworx/products/ has cipcCompany
  // and cipcDirector but NO Compuscan Company Profile, and nothing calls a company-level bundle. The
  // figure is transcribed from rate card §2.1 so the company line's economics live in the SAME SSOT as
  // the consumer bundle rather than being invented at build time. Verify against the live Searchworx
  // pricelist when the commercial flow is actually built.
  compuscan_company_profile: 11000, // R110.00 ex-VAT — company credit profile, deeds, payment behaviour
}
