/**
 * lib/searchworx/products/deedsSearch.ts — Searchworx Deeds Office Search product
 *
 * Notes:  ADDENDUM_14A. Retail: R30 incl. VAT. Cost: R22.80 ex-VAT.
 *         Input: erf number + municipality (or title deed reference).
 *         Output: registered owner, ID number, purchase date/price, deed number.
 *         "No record found" = 404 from vendor; charge still stands per Searchworx rate card.
 */
import { searchworxPost, type SearchworxResult } from "@/lib/searchworx/client"

export interface DeedsSearchInput {
  erfNumber:    string
  municipality: string
  titleDeedRef?: string
}

export interface DeedsSearchFacts {
  owner_name:          string | null
  owner_id_number:     string | null
  purchase_date:       string | null
  purchase_price_cents: number | null
  deed_number:         string | null
  transfer_date:       string | null
}

interface SearchworxDeedsRaw {
  owner_name?:    string
  id_number?:     string
  purchase_date?: string
  purchase_price?: number
  deed_number?:   string
  transfer_date?: string
  [key: string]: unknown
}

export async function runDeedsSearch(
  input: DeedsSearchInput,
): Promise<SearchworxResult<DeedsSearchFacts>> {
  const result = await searchworxPost<SearchworxDeedsRaw>("/deeds/search", {
    erf_number:    input.erfNumber,
    municipality:  input.municipality,
    title_deed_ref: input.titleDeedRef ?? null,
    product_code:  "DEEDS_OFFICE_SEARCH",
  })

  if (!result.ok) return result

  const raw = result.data
  return {
    ok: true,
    data: {
      owner_name:           raw.owner_name ?? null,
      owner_id_number:      raw.id_number ?? null,
      purchase_date:        raw.purchase_date ?? null,
      purchase_price_cents: raw.purchase_price != null ? Math.round(raw.purchase_price * 100) : null,
      deed_number:          raw.deed_number ?? null,
      transfer_date:        raw.transfer_date ?? null,
    },
  }
}
