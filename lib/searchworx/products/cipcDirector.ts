/**
 * lib/searchworx/products/cipcDirector.ts — Searchworx CIPC Director Search (stub)
 *
 * Notes:  ADDENDUM_14H. Stub pending per-product UAT spike. Endpoint path and request body shape
 *         are confirmed from the docs capture (brief/vendors/searchworx/raw/cipc-director-search/)
 *         but no real UAT call has been made yet — do not enable in production without the spike.
 *         Retail: R25 incl. VAT. Cost: R15.65 ex-VAT. Public-register data; POPIA s11(1)(f) basis.
 *         ResponseObject is an ARRAY (unique among the 5 Tier 1 products) — each element is one match.
 *         Note: `Firstname` is PascalCase here (differs from Sigma's lowercase `firstname`).
 */
import { searchworxCall, type SearchworxResult } from "@/lib/searchworx/client"

export interface CipcDirectorInput {
  idNumber:           string
  surname:            string
  firstName:          string
  registrationNumber: string  // company reg — used to narrow matches
}

export async function runCipcDirector(
  input: CipcDirectorInput,
): Promise<SearchworxResult<unknown[]>> {
  return searchworxCall({
    productPath: "cipc/director",
    buildBody: (token) => ({
      SessionToken: token,
      Reference:    input.registrationNumber,
      Surname:      input.surname,
      Firstname:    input.firstName,  // PascalCase — different from Sigma's lowercase `firstname`
      IDNumber:     input.idNumber,
    }),
  })
}
