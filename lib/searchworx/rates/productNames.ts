/**
 * lib/searchworx/rates/productNames.ts — Searchworx price-list name → Pleks product_key (ADDENDUM_14V §3.2)
 *
 * Notes:  EXPLICIT, never fuzzy. A vendor name not in this table is reported by the importer and skipped —
 *         a guessed mapping would put one product's price on another, which is the drift this engine exists
 *         to end. Names are matched exactly as the list prints them (trimmed, case-sensitive).
 *         Confidence (ruled 2026-10-01): the vendor's BILLING name is authoritative. A list name already seen
 *         on a billing row (the 2026-10-01 spike billed combined, VCCB, CIPC company and CompuScan Standard)
 *         is `exact`. Lightstone and deeds were never billed, so their mapping is an inference from the list
 *         alone — `inferred` until the first billing row for the product confirms it. CIPC Director was
 *         called but unbilled; its list name matches the product module's name, so it is `exact`. Volume-break
 *         tiers are not mapped: the billing row shows what was charged.
 */
export type MappingConfidence = "exact" | "inferred"

export const VENDOR_NAME_TO_PRODUCT: Readonly<Record<string, { productKey: string; confidence: MappingConfidence }>> =
  Object.freeze({
    "COMBINED CONSUMER CREDIT REPORT": { productKey: "combined_consumer_credit_report", confidence: "exact" },
    "VCCB INCOME ESTIMATOR": { productKey: "vccb_income_estimator", confidence: "exact" },
    "CIPC COMPANY": { productKey: "cipc_company", confidence: "exact" },
    "CIPC DIRECTOR": { productKey: "cipc_director", confidence: "exact" },
    "COMPUSCAN COMPANY PROFILE STANDARD": { productKey: "compuscan_company_profile", confidence: "exact" },
    "DEEDS OFFICE SEARCH *": { productKey: "deeds_search", confidence: "inferred" },
    "LIGHTSTONE ERF VALUATION SHORT": { productKey: "lightstone_erf_short", confidence: "inferred" },
  })
