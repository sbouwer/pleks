/**
 * app/(dashboard)/settings/details/types.ts — shared org-details shapes (server + client, no "use client")
 *
 * Notes:  Org-LEVEL only — legal entity, registration, VAT, org contact and address. Personal/contact
 *         people live in Team & access. Banking is a read-only summary that links to Trust account.
 */

export interface OrgDetails {
  id: string
  type: "agency" | "landlord" | "sole_prop"
  name: string | null
  trading_as: string | null
  reg_number: string | null
  eaab_number: string | null
  vat_number: string | null
  email: string | null
  phone: string | null
  website: string | null
  linkedin_url: string | null
  facebook_url: string | null
  instagram_url: string | null
  x_url: string | null
  addr_type: string | null
  addr_line1: string | null
  addr_suburb: string | null
  addr_city: string | null
  addr_province: string | null
  addr_postal_code: string | null
  addr2_type: string | null
  addr2_line1: string | null
  addr2_suburb: string | null
  addr2_city: string | null
  addr2_province: string | null
  addr2_postal_code: string | null
}

/** Read-only banking summary for the Banking card (org bank_accounts — governed by Trust account settings). */
export interface OrgBankSummary {
  bankName: string | null
  accountNumberMasked: string | null
  accountType: string | null
}

/** The editable org-detail fields (everything except identity keys). */
export type OrgFormState = Omit<OrgDetails, "id" | "type">

/** Wizard step ids in the org edit modal. */
export type OrgStepId = "organisation" | "contact" | "address"
