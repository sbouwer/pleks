import { APPLICATION_FEE_CENTS, JOINT_APPLICATION_FEE_CENTS } from "@/lib/constants"

export interface SearchworxCheck {
  check_code: string | null
  required: boolean
  cost_excl_vat_cents: number
  fitscore_component: string | null
  note: string
}

export const SEARCHWORX_BUNDLE_SA: SearchworxCheck[] = [
  { check_code: "TRANSUNION_CONSUMER_PROFILE", required: true, cost_excl_vat_cents: 6375, fitscore_component: "credit_score", note: "Standard rates apply for Not Found" },
  { check_code: "XDS_CONSUMER_PROFILE", required: true, cost_excl_vat_cents: 4545, fitscore_component: "credit_score", note: "Cross-bureau validation" },
  { check_code: "CSI_ID_VERIFICATION", required: true, cost_excl_vat_cents: 510, fitscore_component: null, note: "POPIA / FICA requirement" },
  { check_code: "CSI_ID_PHOTO_VERIFICATION", required: true, cost_excl_vat_cents: 2955, fitscore_component: null, note: "Fraud prevention — Dept of Home Affairs biometric" },
  { check_code: "DEFAULT_LISTING_CONSUMER_COMBINED", required: true, cost_excl_vat_cents: 10120, fitscore_component: "rental_history", note: "TPN rental profile + adverse listings" },
  { check_code: "JUDGEMENT_ENQUIRY", required: false, cost_excl_vat_cents: 2440, fitscore_component: "judgements", note: "Conditional — only if adverse items found" },
]

export const SEARCHWORX_BUNDLE_FOREIGN: SearchworxCheck[] = [
  { check_code: "CSI_PASSPORT_VERIFICATION", required: true, cost_excl_vat_cents: 2430, fitscore_component: null, note: "Passport validity check" },
  { check_code: null, required: false, cost_excl_vat_cents: 0, fitscore_component: null, note: "ID photo biometric not available for foreign passports" },
  { check_code: "TRANSUNION_CONSUMER_PROFILE", required: true, cost_excl_vat_cents: 6375, fitscore_component: "credit_score", note: "Passport + nationality + DOB must be accurate" },
  { check_code: "XDS_CONSUMER_PROFILE", required: true, cost_excl_vat_cents: 4545, fitscore_component: "credit_score", note: "Cross-bureau — thin file likely" },
  { check_code: "DEFAULT_LISTING_CONSUMER_COMBINED", required: true, cost_excl_vat_cents: 10120, fitscore_component: "rental_history", note: "TPN by passport — thin file if no prior SA tenancy" },
  { check_code: "CSI_KYC", required: true, cost_excl_vat_cents: 6860, fitscore_component: null, note: "FICA compliance for foreign nationals" },
  { check_code: "JUDGEMENT_ENQUIRY", required: false, cost_excl_vat_cents: 2440, fitscore_component: "judgements", note: "Conditional — only if adverse items found" },
]

export const BUNDLE_COST_SA_EXCL_VAT = 26945
export const BUNDLE_COST_SA_INCL_VAT = 30987
export const BUNDLE_COST_FOREIGN_EXCL_VAT = 24330
export const BUNDLE_COST_FOREIGN_INCL_VAT = 27980

export function getSearchworxBundle(isForeignNational: boolean): SearchworxCheck[] {
  return isForeignNational ? SEARCHWORX_BUNDLE_FOREIGN : SEARCHWORX_BUNDLE_SA
}

export function getRequiredChecks(isForeignNational: boolean): string[] {
  return getSearchworxBundle(isForeignNational)
    .filter((c) => c.required && c.check_code !== null)
    .map((c) => c.check_code!)
}

export function getApplicationFee(isJoint: boolean): number {
  return isJoint ? JOINT_APPLICATION_FEE_CENTS : APPLICATION_FEE_CENTS
}
