/**
 * lib/searchworx/products/lightstoneErfShort.ts — Searchworx Lightstone Erf Valuation Short
 *
 * Notes:  ADDENDUM_14A. Retail: R155 incl. VAT. Cost: R117.00 ex-VAT.
 *         No personal-info subject — property data only. POPIA does not restrict retention.
 *         Input: erf number + municipality (same identifiers as Deeds search).
 *         Output: estimated value range, confidence, last-sale reference.
 */
import { searchworxPost, type SearchworxResult } from "@/lib/searchworx/client"

export interface LightstoneErfShortInput {
  erfNumber:    string
  municipality: string
}

export interface LightstoneErfShortFacts {
  estimated_value_cents:  number | null
  value_low_cents:        number | null
  value_high_cents:       number | null
  confidence:             string | null
  last_sale_date:         string | null
  last_sale_price_cents:  number | null
}

interface SearchworxLightstoneRaw {
  estimated_value?:  number
  value_low?:        number
  value_high?:       number
  confidence?:       string
  last_sale_date?:   string
  last_sale_price?:  number
  [key: string]: unknown
}

export async function runLightstoneErfShort(
  input: LightstoneErfShortInput,
): Promise<SearchworxResult<LightstoneErfShortFacts>> {
  const result = await searchworxPost<SearchworxLightstoneRaw>("/lightstone/erf-valuation-short", {
    erf_number:   input.erfNumber,
    municipality: input.municipality,
    product_code: "LIGHTSTONE_ERF_VALUATION_SHORT",
  })

  if (!result.ok) return result

  const raw = result.data
  return {
    ok: true,
    data: {
      estimated_value_cents: raw.estimated_value != null ? Math.round(raw.estimated_value * 100) : null,
      value_low_cents:       raw.value_low != null ? Math.round(raw.value_low * 100) : null,
      value_high_cents:      raw.value_high != null ? Math.round(raw.value_high * 100) : null,
      confidence:            raw.confidence ?? null,
      last_sale_date:        raw.last_sale_date ?? null,
      last_sale_price_cents: raw.last_sale_price != null ? Math.round(raw.last_sale_price * 100) : null,
    },
  }
}
