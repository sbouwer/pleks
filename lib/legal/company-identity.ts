/**
 * lib/legal/company-identity.ts — supplier identity SSOT for the public legal suite
 *
 * Auth:   public (imported by legal pages and SupplierDisclosure)
 * Data:   static constants — no DB, no env
 * Notes:  Single source of truth for who Pleks legally IS. Before this module the company name,
 *         Information Officer and contact email were typed inline across seven legal pages, so a
 *         change was N edits and drift was inevitable.
 *
 *         ⚠ THREE FIELDS ARE DELIBERATELY NULL AND MUST BE FILLED BEFORE PILOT.
 *         ECT Act 25 of 2002 s43(1) requires an electronic supplier to disclose (among other things)
 *         its registration number, physical address and telephone number. s43(3) gives the consumer
 *         a right to CANCEL THE TRANSACTION WITHIN 14 DAYS where s43(1) is not complied with.
 *         PAIA s51(1)(a) separately requires the postal AND street address of the head of a private
 *         body — the PAIA manual currently gives only "Western Cape, South Africa".
 *
 *         Blocked as at 2026-08-14: Stéan has relocated; a temporary office is not yet arranged and
 *         a shelf company has not yet been purchased, so no registration number exists to publish.
 *         Tracked in brief/build/OUTSTANDING.md § Supplier identity disclosure.
 *
 *         Consumers MUST render only populated fields. A visible "[TBC]" on a published legal page
 *         does not satisfy s43(1) and reads worse than silence — SupplierDisclosure omits nulls.
 */

export interface CompanyIdentity {
  readonly legalName: string
  readonly legalStatus: string
  /** CIPC registration number — ECT s43(1)(c). NULL until the shelf company is bought. */
  readonly registrationNumber: string | null
  /** Street address for service of legal documents — ECT s43(1)(e) + PAIA s51(1)(a). NULL until the office is taken. */
  readonly streetAddress: string | null
  /** Postal address — PAIA s51(1)(a). NULL until the office is taken. */
  readonly postalAddress: string | null
  readonly telephone: string
  readonly email: string
  readonly informationOfficer: string
  /** Coarse location, published today in place of a street address. Not a s43(1) substitute. */
  readonly region: string
}

export const COMPANY_IDENTITY: CompanyIdentity = {
  legalName:          "Pleks (Pty) Ltd",
  legalStatus:        "Private company incorporated in the Republic of South Africa",
  registrationNumber: null, // TODO(ECT-s43): shelf company not yet purchased — see OUTSTANDING.md
  streetAddress:      null, // TODO(ECT-s43/PAIA-s51): temporary office not yet arranged
  postalAddress:      null, // TODO(PAIA-s51): pending the office above
  telephone:          "+27 69 039 5829", // interim — the working support/WhatsApp line, will change with the office
  email:              "legal@pleks.co.za",
  informationOfficer: "Stéan Bouwer",
  region:             "Western Cape, South Africa",
}

/** True once every ECT s43(1) / PAIA s51(1)(a) identity field is publishable. Guards the pilot gate. */
export function isSupplierDisclosureComplete(id: CompanyIdentity = COMPANY_IDENTITY): boolean {
  return Boolean(id.registrationNumber && id.streetAddress && id.postalAddress && id.telephone)
}
