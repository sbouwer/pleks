/**
 * lib/searchworx/rates/productNames.ts — Searchworx price-list name → Pleks product_key (ADDENDUM_14V §3.2)
 *
 * Notes:  EXPLICIT, never fuzzy. A vendor name not in this table is reported by the importer and skipped —
 *         a guessed mapping would put one product's price on another, which is the drift this engine exists
 *         to end. Names are matched exactly as the list prints them (trimmed, case-sensitive).
 *         Two mappings are inferences rather than name matches, and say so: Pleks calls the Lightstone short
 *         erf valuation and the CompuScan Standard company profile, and the list names no other candidate
 *         for either (14V verification row 53). Deeds maps the base tier only; the volume-break tiers are
 *         reported, because Pleks does not buy at volume.
 */
export const VENDOR_NAME_TO_PRODUCT_KEY: Readonly<Record<string, string>> = Object.freeze({
  "COMBINED CONSUMER CREDIT REPORT": "combined_consumer_credit_report",
  "VCCB INCOME ESTIMATOR": "vccb_income_estimator",
  "CIPC COMPANY": "cipc_company",
  "CIPC DIRECTOR": "cipc_director",
  "COMPUSCAN COMPANY PROFILE STANDARD": "compuscan_company_profile", // inference — see header
  "DEEDS OFFICE SEARCH *": "deeds_search",
  "LIGHTSTONE ERF VALUATION SHORT": "lightstone_erf_short", // inference — see header
})
