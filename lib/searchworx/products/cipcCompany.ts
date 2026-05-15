/**
 * lib/searchworx/products/cipcCompany.ts — Searchworx CIPC Company lookup
 *
 * Notes:  ADDENDUM_14A. Retail: R25 incl. VAT. Cost: R15.65 ex-VAT.
 *         Public-register data. POPIA s11(1)(f) legitimate-interest basis.
 *         Input: company registration number (format: YYYY/NNNNNN/NN).
 *         Output: registered name, status, registered address, business start date.
 */
import { searchworxPost, type SearchworxResult } from "@/lib/searchworx/client"

export interface CipcCompanyInput {
  registrationNumber: string
}

export interface CipcCompanyFacts {
  registered_name:      string | null
  registration_number:  string | null
  status:               string | null
  status_date:          string | null
  registered_address:   string | null
  business_start_date:  string | null
}

interface SearchworxCipcCompanyRaw {
  registered_name?:     string
  registration_number?: string
  status?:              string
  status_date?:         string
  registered_address?:  string
  business_start_date?: string
  [key: string]: unknown
}

export async function runCipcCompany(
  input: CipcCompanyInput,
): Promise<SearchworxResult<CipcCompanyFacts>> {
  const result = await searchworxPost<SearchworxCipcCompanyRaw>("/cipc/company", {
    registration_number: input.registrationNumber,
    product_code:        "CIPC_COMPANY",
  })

  if (!result.ok) return result

  const raw = result.data
  return {
    ok: true,
    data: {
      registered_name:     raw.registered_name ?? null,
      registration_number: raw.registration_number ?? input.registrationNumber,
      status:              raw.status ?? null,
      status_date:         raw.status_date ?? null,
      registered_address:  raw.registered_address ?? null,
      business_start_date: raw.business_start_date ?? null,
    },
  }
}
