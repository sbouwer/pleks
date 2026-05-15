/**
 * lib/searchworx/products/lightstoneErfShort.ts — Searchworx LightStone Property Valuation on Erf (stub)
 *
 * Notes:  ADDENDUM_14H. Stub pending per-product UAT spike. Endpoint path and request body shape
 *         are confirmed from the docs capture (brief/vendors/searchworx/raw/lightstone-erf-valuation/)
 *         but no real UAT call has been made yet — do not enable in production without the spike.
 *         Retail: R155 incl. VAT. Cost: R117.00 ex-VAT. Uses PascalCase request body.
 *         No personal-info subject — property data only. POPIA does not restrict retention.
 */
import { searchworxCall, type SearchworxResult } from "@/lib/searchworx/client"

export interface LightstoneErfShortInput {
  erfNumber:      string
  municipality:   string
  portionNumber?: string
}

export async function runLightstoneErfShort(
  input: LightstoneErfShortInput,
): Promise<SearchworxResult<Record<string, unknown>>> {
  return searchworxCall({
    productPath: "lightstone/valuation/erf",
    buildBody: (token) => ({
      SessionToken:  token,
      Reference:     input.erfNumber,
      Township:      input.municipality,
      ErfNumber:     input.erfNumber,
      PortionNumber: input.portionNumber ?? "0",
    }),
  })
}
