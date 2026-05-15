/**
 * lib/property-intelligence/types.ts — Shared types for the property-intelligence module
 *
 * Notes:  ADDENDUM_14A. Re-exports product fact types so the PDF template and run route
 *         share the same shape without circular imports.
 */
export type { DeedsSearchFacts }     from "@/lib/searchworx/products/deedsSearch"
export type { LightstoneErfShortFacts } from "@/lib/searchworx/products/lightstoneErfShort"
export type { CipcCompanyFacts }     from "@/lib/searchworx/products/cipcCompany"
export type { CipcDirectorFacts }    from "@/lib/searchworx/products/cipcDirector"

export const PRODUCT_LABELS: Record<string, string> = {
  deeds_search:         "Deeds Office Search",
  lightstone_erf_short: "Lightstone Erf Valuation Short",
  cipc_company:         "CIPC Company Verification",
  cipc_director:        "CIPC Director Verification",
}
