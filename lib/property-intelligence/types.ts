/**
 * lib/property-intelligence/types.ts — Shared types for the property-intelligence module
 *
 * Notes:  ADDENDUM_14A + 14H. Facts types define the shape the PDF template and run route expect.
 *         The product modules are stubs pending per-product UAT spikes; at runtime their raw response
 *         data is cast to these shapes by the run route. Real parsers will populate these fields once
 *         per-product modules are implemented (ADDENDUM_14H Phase 5-6).
 */

export interface DeedsSearchFacts {
  owner_name:           string | null
  owner_id_number:      string | null
  purchase_date:        string | null
  purchase_price_cents: number | null
  deed_number:          string | null
  transfer_date:        string | null
}

export interface LightstoneErfShortFacts {
  estimated_value_cents:  number | null
  value_low_cents:        number | null
  value_high_cents:       number | null
  confidence:             string | null
  last_sale_date:         string | null
  last_sale_price_cents:  number | null
}

export interface CipcCompanyFacts {
  registered_name:     string | null
  registration_number: string | null
  status:              string | null
  status_date:         string | null
  registered_address:  string | null
  business_start_date: string | null
}

export interface CipcDirectorFacts {
  director_name:      string | null
  director_id_number: string | null
  appointment_date:   string | null
  status:             string | null
  position:           string | null
}

export const PRODUCT_LABELS: Record<string, string> = {
  deeds_search:         "Deeds Office Search",
  lightstone_erf_short: "Lightstone Erf Valuation Short",
  cipc_company:         "CIPC Company Verification",
  cipc_director:        "CIPC Director Verification",
}
