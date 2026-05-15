/**
 * lib/searchworx/costs.ts — Searchworx product wholesale cost rates (ADDENDUM_14H §6)
 *
 * Notes:  Cost cents = wholesale ex-VAT. Retail cents set per-pull at purchase time (property_intelligence_pulls.retail_cents).
 *         Update when Searchworx issues a revised rate card.
 *         TBD entries pending rate card confirmation from John.
 */

export const SEARCHWORX_COSTS: Record<string, number> = {
  experian_sigma:        4065,  // R40.65 ex-VAT (SEARCHWORX_RATE_CARD.md — applicant-screening lane)
  deeds_search:          2280,  // R22.80 ex-VAT (14A v2 rate card)
  lightstone_erf_short:  11700, // R117.00 ex-VAT (14A v2 rate card)
  cipc_company:          1565,  // R15.65 ex-VAT (14A v2 rate card)
  cipc_director:         2174,  // R21.74 ex-VAT (SEARCHWORX_RATE_CARD.md — verify against John's confirmation)
}
