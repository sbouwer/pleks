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
  "first names": { field: "first_name", entity: "tenant" },
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
  // Tenant identity — extended
  work_phone: { field: "work_phone", entity: "tenant" },
  "work phone": { field: "work_phone", entity: "tenant" },
  office_phone: { field: "work_phone", entity: "tenant" },
  "office phone": { field: "work_phone", entity: "tenant" },
  date_of_birth: { field: "date_of_birth", entity: "tenant" },
  "date of birth": { field: "date_of_birth", entity: "tenant" },
  dob: { field: "date_of_birth", entity: "tenant" },
  birth_date: { field: "date_of_birth", entity: "tenant" },
  birthdate: { field: "date_of_birth", entity: "tenant" },
  nationality: { field: "nationality", entity: "tenant" },
  citizenship: { field: "nationality", entity: "tenant" },
  company_name: { field: "company_name", entity: "tenant" },
  "company name": { field: "company_name", entity: "tenant" },
  organisation_name: { field: "company_name", entity: "tenant" },
  registration_number: { field: "registration_number", entity: "tenant" },
  "registration number": { field: "registration_number", entity: "tenant" },
  cipc_number: { field: "registration_number", entity: "tenant" },
  vat_number: { field: "vat_number", entity: "tenant" },
  "vat number": { field: "vat_number", entity: "tenant" },
  preferred_contact: { field: "preferred_contact", entity: "tenant" },
  "preferred contact": { field: "preferred_contact", entity: "tenant" },
  contact_method: { field: "preferred_contact", entity: "tenant" },
  // Tenant next of kin / emergency contacts
  next_of_kin_name: { field: "next_of_kin_name", entity: "tenant" },
  "next of kin name": { field: "next_of_kin_name", entity: "tenant" },
  "next of kin": { field: "next_of_kin_name", entity: "tenant" },
  nok_name: { field: "next_of_kin_name", entity: "tenant" },
  next_of_kin_phone: { field: "next_of_kin_phone", entity: "tenant" },
  "next of kin phone": { field: "next_of_kin_phone", entity: "tenant" },
  nok_phone: { field: "next_of_kin_phone", entity: "tenant" },
  next_of_kin_relationship: { field: "next_of_kin_relationship", entity: "tenant" },
  "next of kin relationship": { field: "next_of_kin_relationship", entity: "tenant" },
  nok_relationship: { field: "next_of_kin_relationship", entity: "tenant" },
  emergency_contact_name: { field: "emergency_contact_name", entity: "tenant" },
  "emergency contact name": { field: "emergency_contact_name", entity: "tenant" },
  "emergency contact": { field: "emergency_contact_name", entity: "tenant" },
  emergency_contact_phone: { field: "emergency_contact_phone", entity: "tenant" },
  "emergency contact phone": { field: "emergency_contact_phone", entity: "tenant" },
  // Tenant fields that go to notes (no schema column — auto-captured as notes)
  marital_status: { field: "tenant_notes", entity: "extra" },
  "marital status": { field: "tenant_notes", entity: "extra" },
  visa_expiry_date: { field: "tenant_notes", entity: "extra" },
  "visa expiry date": { field: "tenant_notes", entity: "extra" },
  work_permit_number: { field: "tenant_notes", entity: "extra" },
  "work permit number": { field: "tenant_notes", entity: "extra" },
  vehicle_registration: { field: "tenant_notes", entity: "extra" },
  "vehicle registration": { field: "tenant_notes", entity: "extra" },
  alternative_email: { field: "tenant_notes", entity: "extra" },
  "alternative email": { field: "tenant_notes", entity: "extra" },
  previous_address: { field: "tenant_notes", entity: "extra" },
  "previous address": { field: "tenant_notes", entity: "extra" },

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
  bedrooms: { field: "bedrooms", entity: "unit" },
  beds: { field: "bedrooms", entity: "unit" },
  bathrooms: { field: "bathrooms", entity: "unit" },
  baths: { field: "bathrooms", entity: "unit" },
  // Unit — extended
  postal_code: { field: "postal_code", entity: "unit" },
  "postal code": { field: "postal_code", entity: "unit" },
  postcode: { field: "postal_code", entity: "unit" },
  zip_code: { field: "postal_code", entity: "unit" },
  property_type: { field: "property_type_import", entity: "unit" },
  "property type": { field: "property_type_import", entity: "unit" },
  erf_number: { field: "erf_number", entity: "unit" },
  "erf number": { field: "erf_number", entity: "unit" },
  erf: { field: "erf_number", entity: "unit" },
  floor_level: { field: "unit_floor", entity: "unit" },
  "floor level": { field: "unit_floor", entity: "unit" },
  floor: { field: "unit_floor", entity: "unit" },
  storey: { field: "unit_floor", entity: "unit" },
  size_sqm: { field: "unit_size_m2", entity: "unit" },
  "size sqm": { field: "unit_size_m2", entity: "unit" },
  size_m2: { field: "unit_size_m2", entity: "unit" },
  "size m2": { field: "unit_size_m2", entity: "unit" },
  floor_area: { field: "unit_size_m2", entity: "unit" },
  "floor area": { field: "unit_size_m2", entity: "unit" },
  parking_bays: { field: "parking_bays", entity: "unit" },
  "parking bays": { field: "parking_bays", entity: "unit" },
  parking: { field: "parking_bays", entity: "unit" },
  furnished: { field: "furnished", entity: "unit" },
  is_furnished: { field: "furnished", entity: "unit" },
  // Unit fields that go to notes (no schema column)
  unit_type: { field: "unit_notes", entity: "extra" },
  "unit type": { field: "unit_notes", entity: "extra" },
  pet_friendly: { field: "unit_notes", entity: "extra" },
  "pet friendly": { field: "unit_notes", entity: "extra" },
  water_meter_number: { field: "unit_notes", entity: "extra" },
  "water meter number": { field: "unit_notes", entity: "extra" },
  electricity_meter_number: { field: "unit_notes", entity: "extra" },
  "electricity meter number": { field: "unit_notes", entity: "extra" },
  municipal_account_number: { field: "unit_notes", entity: "extra" },
  "municipal account number": { field: "unit_notes", entity: "extra" },

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
  // Lease — extended
  lease_type: { field: "lease_type", entity: "lease" },
  "lease type": { field: "lease_type", entity: "lease" },
  is_fixed_term: { field: "is_fixed_term", entity: "lease" },
  "is fixed term": { field: "is_fixed_term", entity: "lease" },
  fixed_term: { field: "is_fixed_term", entity: "lease" },
  notice_period_days: { field: "notice_period_days", entity: "lease" },
  "notice period days": { field: "notice_period_days", entity: "lease" },
  notice_period: { field: "notice_period_days", entity: "lease" },
  "notice period": { field: "notice_period_days", entity: "lease" },
  cpa_applies: { field: "cpa_applies", entity: "lease" },
  "cpa applies": { field: "cpa_applies", entity: "lease" },
  escalation_type: { field: "escalation_type", entity: "lease" },
  "escalation type": { field: "escalation_type", entity: "lease" },
  escalation_review_date: { field: "escalation_review_date", entity: "lease" },
  "escalation review date": { field: "escalation_review_date", entity: "lease" },
  payment_due_day: { field: "payment_due_day", entity: "lease" },
  "payment due day": { field: "payment_due_day", entity: "lease" },
  rent_due_day: { field: "payment_due_day", entity: "lease" },
  special_conditions: { field: "lease_conditions", entity: "lease" },
  "special conditions": { field: "lease_conditions", entity: "lease" },
  special_terms: { field: "lease_conditions", entity: "lease" },
  "special terms": { field: "lease_conditions", entity: "lease" },
  // Owner / landlord fields (stored on properties table)
  owner_name: { field: "owner_name", entity: "owner" },
  "owner name": { field: "owner_name", entity: "owner" },
  landlord_name: { field: "owner_name", entity: "owner" },
  "landlord name": { field: "owner_name", entity: "owner" },
  owner_email: { field: "owner_email", entity: "owner" },
  "owner email": { field: "owner_email", entity: "owner" },
  landlord_email: { field: "owner_email", entity: "owner" },
  owner_phone: { field: "owner_phone", entity: "owner" },
  "owner phone": { field: "owner_phone", entity: "owner" },
  landlord_phone: { field: "owner_phone", entity: "owner" },
  owner_bank_name: { field: "owner_bank_name", entity: "owner" },
  "owner bank name": { field: "owner_bank_name", entity: "owner" },
  owner_bank_account: { field: "owner_bank_account", entity: "owner" },
  "owner bank account": { field: "owner_bank_account", entity: "owner" },
  owner_bank_branch: { field: "owner_bank_branch", entity: "owner" },
  "owner bank branch": { field: "owner_bank_branch", entity: "owner" },
  owner_bank_type: { field: "owner_bank_type", entity: "owner" },
  "owner bank type": { field: "owner_bank_type", entity: "owner" },
  // Tenant bank — simple (without _1 suffix for new template convenience)
  tenant_bank_name: { field: "tenant_bank_name_1", entity: "bank" },
  "tenant bank name": { field: "tenant_bank_name_1", entity: "bank" },
  tenant_bank_account: { field: "tenant_bank_account_1", entity: "bank" },
  "tenant bank account": { field: "tenant_bank_account_1", entity: "bank" },
  tenant_bank_branch: { field: "tenant_bank_branch_1", entity: "bank" },
  "tenant bank branch": { field: "tenant_bank_branch_1", entity: "bank" },

  // TPN-specific fields
  identifier: { field: "id_number", entity: "tenant" },
  textbox28: { field: "id_number", entity: "tenant" },
  numbers: { field: "phone", entity: "tenant" },
  "legal name": { field: "legal_name", entity: "extra" },
  legalname: { field: "legal_name", entity: "extra" },
  "trading name": { field: "trading_name", entity: "extra" },
  tradingname: { field: "trading_name", entity: "extra" },
  // "registration number" intentionally omitted — already mapped to registration_number in tenant section above
  "reg number": { field: "registration_number", entity: "tenant" },
  regnumber: { field: "registration_number", entity: "tenant" },
  "trust/npo/gov number": { field: "trust_number", entity: "extra" },
  reference: { field: "__tpn_reference", entity: "extra" },
  "entity id": { field: "__entity_id", entity: "extra" },
  entityid: { field: "__entity_id", entity: "extra" },
  description: { field: "__description", entity: "extra" },
  // "date of birth" intentionally omitted — already mapped to date_of_birth in tenant section above
  dateofbirth: { field: "date_of_birth", entity: "tenant" },
  // "vat number" intentionally omitted — already mapped to vat_number in tenant section above
  vatnumber1: { field: "vat_number", entity: "tenant" },
  vatnumber: { field: "vat_number", entity: "tenant" },
  // TPN address fields (addresstype columns are metadata, not addresses)
  addresstype1: { field: "__address_type", entity: "extra" },
  addresstype2: { field: "__address_type", entity: "extra" },
  addresstype3: { field: "__address_type", entity: "extra" },
  address1: { field: "address", entity: "unit" },
  address2: { field: "__address_2", entity: "extra" },
  address3: { field: "__address_3", entity: "extra" },

  // Bank fields
  "bank account 1": { field: "tenant_bank_account_1", entity: "bank" },
  bankaccount1: { field: "tenant_bank_account_1", entity: "bank" },
  "bank name 1": { field: "tenant_bank_name_1", entity: "bank" },
  bankname1: { field: "tenant_bank_name_1", entity: "bank" },
  "bank branch 1": { field: "tenant_bank_branch_1", entity: "bank" },
  bankbranch1: { field: "tenant_bank_branch_1", entity: "bank" },
  "bank account 2": { field: "tenant_bank_account_2", entity: "bank" },
  bankaccount2: { field: "tenant_bank_account_2", entity: "bank" },
  "bank name 2": { field: "tenant_bank_name_2", entity: "bank" },
  bankname2: { field: "tenant_bank_name_2", entity: "bank" },
  "bank branch 2": { field: "tenant_bank_branch_2", entity: "bank" },
  bankbranch2: { field: "tenant_bank_branch_2", entity: "bank" },

  // State/filter fields
  state: { field: "__entity_state", entity: "filter" },
  "entity state": { field: "__entity_state", entity: "filter" },
  entitystate1: { field: "__entity_state", entity: "filter" },
  "entity state 1": { field: "__entity_state", entity: "filter" },
  status: { field: "__entity_state", entity: "filter" },
  "contact type": { field: "__entity_type", entity: "filter" },
  type: { field: "__entity_type", entity: "filter" },
  entitytype1: { field: "__entity_type", entity: "filter" },
  "entity type 1": { field: "__entity_type", entity: "filter" },
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
    const underscored = normalised.replaceAll(" ", "_")
    const underscoreMatch = FIELD_ALIASES[underscored]
    if (underscoreMatch) {
      return {
        column: header,
        field: underscoreMatch.field,
        entity: underscoreMatch.entity,
        confidence: "high" as const,
      }
    }

    // Partial/fuzzy: only for longer aliases (min 6 chars) to avoid
    // false positives like "id" matching "entityid" or "name" matching "bankname1"
    for (const [alias, mapping] of Object.entries(FIELD_ALIASES)) {
      if (alias.length < 6) continue
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
