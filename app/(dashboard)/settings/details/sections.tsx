/**
 * app/(dashboard)/settings/details/sections.tsx — org-details form model (types + option constants)
 *
 * Notes:  Shared shape for the org's person/contact/address columns (organisations row) + the option
 *         lists the canonical fields render. Consumed by getOrgDetails (loader) and the My profile forms.
 *         The fields themselves come from components/forms/fields (the canonical add-contact grammar) —
 *         this module is data only.
 */
export const TITLES = ["Mr", "Mrs", "Ms", "Miss", "Dr", "Prof", "Adv", "Rev"]
export const PROVINCES = [
  "Eastern Cape", "Free State", "Gauteng", "KwaZulu-Natal",
  "Limpopo", "Mpumalanga", "Northern Cape", "North West", "Western Cape",
]
export const ADDRESS_TYPES = ["residential", "postal", "work", "business", "other"]

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
  address: string | null
  website: string | null
  title: string | null
  first_name: string | null
  last_name: string | null
  initials: string | null
  gender: string | null
  date_of_birth: string | null
  id_number: string | null
  mobile: string | null
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
  primary_contact_is_user: boolean
  office_hours_weekday: string | null
  office_hours_saturday: string | null
  office_hours_sunday: string | null
  office_hours_public_holidays: string | null
  emergency_phone: string | null
  emergency_contact_name: string | null
  emergency_instructions: string | null
  emergency_email: string | null
}

export type FormState = Omit<OrgDetails, "id" | "type" | "primary_contact_is_user">
