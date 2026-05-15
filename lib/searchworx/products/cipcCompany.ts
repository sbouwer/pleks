/**
 * lib/searchworx/products/cipcCompany.ts — Searchworx CIPC Company Search by Registration Number (stub)
 *
 * Notes:  ADDENDUM_14H. Stub pending per-product UAT spike. Endpoint path and request body shape
 *         are confirmed from the docs capture (brief/vendors/searchworx/raw/cipc-company-search/)
 *         but no real UAT call has been made yet — do not enable in production without the spike.
 *         Retail: R25 incl. VAT. Cost: R15.65 ex-VAT. Public-register data; POPIA s11(1)(f) basis.
 *         CRITICAL: This endpoint uses camelCase request body (sessionToken, registrationNumber),
 *         unlike all other Searchworx products which use PascalCase. buildBody handles this.
 */
import { searchworxCall, type SearchworxResult } from "@/lib/searchworx/client"

export interface CipcCompanyInput {
  registrationNumber: string  // SA company reg format: YYYY/NNNNNN/NN
  reference?:         string
}

export async function runCipcCompany(
  input: CipcCompanyInput,
): Promise<SearchworxResult<Record<string, unknown>>> {
  return searchworxCall({
    productPath: "cipc/company/registrationNumber/NoMulti",
    buildBody: (token) => ({
      sessionToken:       token,              // camelCase — CIPC Company quirk; differs from all other products
      reference:          input.reference ?? input.registrationNumber,
      registrationNumber: input.registrationNumber,
    }),
  })
}
