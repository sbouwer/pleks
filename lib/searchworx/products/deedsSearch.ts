/**
 * lib/searchworx/products/deedsSearch.ts — Searchworx Deeds Office Property Search on Erf (stub)
 *
 * Notes:  ADDENDUM_14H. Stub pending per-product UAT spike. Endpoint path and request body shape
 *         are confirmed from the docs capture (brief/vendors/searchworx/raw/deeds-search/) but no
 *         real UAT call has been made yet — do not enable in production without the spike.
 *         Priced from searchworx_rates (ADDENDUM_14V), never here. Uses PascalCase request body.
 *         Reference is the caller's line id (the PI pull id) — the billing reconcile joins on it.
 *         DeedsOffice integer maps to the registrar jurisdiction (1=Bloemfontein, 2=Cape Town, ...).
 */
import { searchworxCall, type SearchworxResult } from "@/lib/searchworx/client"

export interface DeedsSearchInput {
  erfNumber:      string
  municipality:   string
  deedsOffice?:   number  // 1–12 per the deeds-office enum; defaults to 2 (Cape Town) if omitted
  portionNumber?: string
  titleDeedRef?:  string
  /** The PI pull id. Sent as Reference so a billing-report row joins back to exactly one pull. */
  reference:      string
}

export async function runDeedsSearch(
  input: DeedsSearchInput,
): Promise<SearchworxResult<Record<string, unknown>>> {
  return searchworxCall({
    productPath: "deedsoffice/property/erf",
    buildBody: (token) => ({
      SessionToken:    token,
      Reference:       input.reference,
      DeedsOffice:     input.deedsOffice ?? 2,
      Township:        input.municipality,
      ErfNumber:       input.erfNumber,
      PortionNumber:   input.portionNumber ?? "0",
      RemainingExtent: false,
    }),
  })
}
