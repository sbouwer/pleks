export interface ColumnSuggestion {
  /** Original column header from the file */
  column: string
  /** Mapped Pleks field name, or null if no match */
  field: string | null
  /** Entity this field belongs to */
  entity: string
  /** Confidence of the match */
  confidence: "high" | "medium" | "low"
}

interface FieldAlias {
  field: string
  entity: string
}

/**
 * Map of normalised column header aliases to Pleks field definitions.
 * Keys are lowercase, trimmed versions of common column names.
 */
export const FIELD_ALIASES: Record<string, FieldAlias> = {
  // Tenant fields
  first_name: { field: "first_name", entity: "tenant" },
  firstname: { field: "first_name", entity: "tenant" },
  "first name": { field: "first_name", entity: "tenant" },
  name: { field: "first_name", entity: "tenant" },
  last_name: { field: "last_name", entity: "tenant" },
  lastname: { field: "last_name", entity: "tenant" },
  "last name": { field: "last_name", entity: "tenant" },
  surname: { field: "last_name", entity: "tenant" },
  full_name: { field: "__split_name", entity: "tenant" },
  "full name": { field: "__split_name", entity: "tenant" },
  fullname: { field: "__split_name", entity: "tenant" },
  "tenant name": { field: "__split_name", entity: "tenant" },
  tenant_name: { field: "__split_name", entity: "tenant" },
  email: { field: "email", entity: "tenant" },
  email_address: { field: "email", entity: "tenant" },
  "email address": { field: "email", entity: "tenant" },
  tenant_email: { field: "email", entity: "tenant" },
  phone: { field: "phone", entity: "tenant" },
  phone_number: { field: "phone", entity: "tenant" },
  "phone number": { field: "phone", entity: "tenant" },
  mobile: { field: "phone", entity: "tenant" },
  mobile_number: { field: "phone", entity: "tenant" },
  "mobile number": { field: "phone", entity: "tenant" },
  cell: { field: "phone", entity: "tenant" },
  cellphone: { field: "phone", entity: "tenant" },
  id_number: { field: "id_number", entity: "tenant" },
  "id number": { field: "id_number", entity: "tenant" },
  id: { field: "id_number", entity: "tenant" },
  sa_id: { field: "id_number", entity: "tenant" },
  "sa id": { field: "id_number", entity: "tenant" },
  identity_number: { field: "id_number", entity: "tenant" },
  "identity number": { field: "id_number", entity: "tenant" },
  employer_name: { field: "employer_name", entity: "tenant" },
  "employer name": { field: "employer_name", entity: "tenant" },
  employer: { field: "employer_name", entity: "tenant" },
  employment_type: { field: "employment_type", entity: "tenant" },
  "employment type": { field: "employment_type", entity: "tenant" },
  occupation: { field: "occupation", entity: "tenant" },
  tenant_role: { field: "tenant_role", entity: "tenant" },
  "tenant role": { field: "tenant_role", entity: "tenant" },
  role: { field: "tenant_role", entity: "tenant" },

  // Unit fields
  property_name: { field: "property_name", entity: "unit" },
  "property name": { field: "property_name", entity: "unit" },
  property: { field: "property_name", entity: "unit" },
  building: { field: "property_name", entity: "unit" },
  building_name: { field: "property_name", entity: "unit" },
  "building name": { field: "property_name", entity: "unit" },
  unit_number: { field: "unit_number", entity: "unit" },
  "unit number": { field: "unit_number", entity: "unit" },
  unit: { field: "unit_number", entity: "unit" },
  unit_name: { field: "unit_number", entity: "unit" },
  "unit name": { field: "unit_number", entity: "unit" },
  flat_number: { field: "unit_number", entity: "unit" },
  "flat number": { field: "unit_number", entity: "unit" },
  address: { field: "address", entity: "unit" },
  address_line1: { field: "address", entity: "unit" },
  "address line 1": { field: "address", entity: "unit" },
  street_address: { field: "address", entity: "unit" },
  "street address": { field: "address", entity: "unit" },
  suburb: { field: "suburb", entity: "unit" },
  area: { field: "suburb", entity: "unit" },
  city: { field: "city", entity: "unit" },
  town: { field: "city", entity: "unit" },
  province: { field: "province", entity: "unit" },
  state: { field: "province", entity: "unit" },
  bedrooms: { field: "bedrooms", entity: "unit" },
  beds: { field: "bedrooms", entity: "unit" },
  bathrooms: { field: "bathrooms", entity: "unit" },
  baths: { field: "bathrooms", entity: "unit" },

  // Lease fields
  lease_start: { field: "lease_start", entity: "lease" },
  "lease start": { field: "lease_start", entity: "lease" },
  lease_start_date: { field: "lease_start", entity: "lease" },
  "lease start date": { field: "lease_start", entity: "lease" },
  start_date: { field: "lease_start", entity: "lease" },
  "start date": { field: "lease_start", entity: "lease" },
  commencement_date: { field: "lease_start", entity: "lease" },
  "commencement date": { field: "lease_start", entity: "lease" },
  lease_end: { field: "lease_end", entity: "lease" },
  "lease end": { field: "lease_end", entity: "lease" },
  lease_end_date: { field: "lease_end", entity: "lease" },
  "lease end date": { field: "lease_end", entity: "lease" },
  end_date: { field: "lease_end", entity: "lease" },
  "end date": { field: "lease_end", entity: "lease" },
  expiry_date: { field: "lease_end", entity: "lease" },
  "expiry date": { field: "lease_end", entity: "lease" },
  rent_amount_cents: { field: "rent_amount_cents", entity: "lease" },
  monthly_rent: { field: "rent_amount_cents", entity: "lease" },
  "monthly rent": { field: "rent_amount_cents", entity: "lease" },
  rent: { field: "rent_amount_cents", entity: "lease" },
  rent_amount: { field: "rent_amount_cents", entity: "lease" },
  "rent amount": { field: "rent_amount_cents", entity: "lease" },
  monthly_rent_cents: { field: "rent_amount_cents", entity: "lease" },
  deposit_amount_cents: { field: "deposit_amount_cents", entity: "lease" },
  deposit: { field: "deposit_amount_cents", entity: "lease" },
  deposit_amount: { field: "deposit_amount_cents", entity: "lease" },
  "deposit amount": { field: "deposit_amount_cents", entity: "lease" },
  escalation_percent: { field: "escalation_percent", entity: "lease" },
  "escalation percent": { field: "escalation_percent", entity: "lease" },
  escalation: { field: "escalation_percent", entity: "lease" },
  "escalation %": { field: "escalation_percent", entity: "lease" },
  annual_increase: { field: "escalation_percent", entity: "lease" },
  "annual increase": { field: "escalation_percent", entity: "lease" },
  payment_method: { field: "payment_method", entity: "lease" },
  "payment method": { field: "payment_method", entity: "lease" },
  payment_type: { field: "payment_method", entity: "lease" },
  "payment type": { field: "payment_method", entity: "lease" },
}

/**
 * Match spreadsheet headers against known field aliases.
 * Returns a suggestion for each header column.
 */
export function matchColumns(headers: string[]): ColumnSuggestion[] {
  return headers.map((header) => {
    const normalised = header.toLowerCase().trim()

    // Exact match
    const exactMatch = FIELD_ALIASES[normalised]
    if (exactMatch) {
      return {
        column: header,
        field: exactMatch.field,
        entity: exactMatch.entity,
        confidence: "high" as const,
      }
    }

    // Normalised with underscores instead of spaces
    const underscored = normalised.replace(/\s+/g, "_")
    const underscoreMatch = FIELD_ALIASES[underscored]
    if (underscoreMatch) {
      return {
        column: header,
        field: underscoreMatch.field,
        entity: underscoreMatch.entity,
        confidence: "high" as const,
      }
    }

    // Partial/fuzzy: check if any alias key is contained in the header or vice versa
    for (const [alias, mapping] of Object.entries(FIELD_ALIASES)) {
      if (normalised.includes(alias) || alias.includes(normalised)) {
        return {
          column: header,
          field: mapping.field,
          entity: mapping.entity,
          confidence: "medium" as const,
        }
      }
    }

    return {
      column: header,
      field: null,
      entity: "unknown",
      confidence: "low" as const,
    }
  })
}
