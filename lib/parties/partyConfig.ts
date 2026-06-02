/**
 * lib/parties/partyConfig.ts — single source of truth for the unified "add party" flow
 *
 * Data:   role metadata + shared option lists driving the AddPartyModal (landlord/tenant/supplier)
 * Notes:  DRY by design — copy, role behaviour (fullFica), specialities, ID types and the
 *         entity→contacts.entity_type mapping all live HERE so a design tweak is a one-place change.
 *         A "party" is always a contacts row + a thin role extension (landlords/tenants/contractors);
 *         company-vs-individual is contacts.entity_type ("organisation" | "individual").
 */

export type PartyRole = "landlord" | "tenant" | "supplier"
export type PartyEntity = "individual" | "company"

export interface PartyRoleConfig {
  /** internal contacts.primary_role + role extension table key */
  primaryRole: "landlord" | "tenant" | "contractor"
  singular: string
  plural: string
  /** one-line blurb under the modal title */
  blurb: string
  /** the step-2 (details) section heading + review group label */
  detailsTitle: string
  /**
   * Full FICA capture (registered address + mandated signatory with ID, and an individual ID).
   * Landlords/tenants sign leases / receive trust payouts → true. Suppliers are a trading name +
   * a primary contact, no FICA → false (and no ID is stored — matches the existing contractor create).
   */
  fullFica: boolean
  /** success-view copy */
  successNote: string
  /** primary success action label (null = no primary action, just "Done") */
  successAction: string | null
}

export const PARTY_ROLES: Record<PartyRole, PartyRoleConfig> = {
  landlord: {
    primaryRole: "landlord",
    singular: "Landlord",
    plural: "Landlords",
    blurb: "The property owner you collect rent and pay out on behalf of.",
    detailsTitle: "Landlord details",
    fullFica: true,
    successNote: "Their landlord profile is ready — add a property whenever you like.",
    successAction: "Generate welcome pack",
  },
  tenant: {
    primaryRole: "tenant",
    singular: "Tenant",
    plural: "Tenants",
    blurb: "The person or company who rents and occupies a unit.",
    detailsTitle: "Tenant details",
    fullFica: true,
    successNote: "Consent is on file. You can place them on a lease now or later.",
    successAction: "Start a lease for them",
  },
  supplier: {
    primaryRole: "contractor",
    singular: "Contractor",
    plural: "Contractors",
    blurb: "A maintenance contractor or service provider you assign jobs to.",
    detailsTitle: "Contractor details",
    fullFica: false,
    successNote: "They'll now surface for matching maintenance jobs.",
    successAction: "Assign to a job",
  },
}

export const PARTY_ROLE_ORDER: PartyRole[] = ["landlord", "tenant", "supplier"]

/** contacts.entity_type stores "organisation" (not "company"); individual stays "individual". */
export function toContactEntityType(entity: PartyEntity): "organisation" | "individual" {
  return entity === "company" ? "organisation" : "individual"
}

export const PARTY_ID_TYPES = [
  { value: "sa_id", label: "SA ID Number" },
  { value: "passport", label: "Passport" },
  { value: "permit", label: "Permit" },
] as const

/**
 * Contractor speciality options — the single canonical list (was duplicated in SuppliersClient).
 * Used by the supplier-role details step and the suppliers table.
 */
export const SPECIALITY_OPTIONS = [
  "Plumbing",
  "Electrical",
  "Carpentry",
  "Leak Detection",
  "Body Corporate",
  "Painting",
  "Tiling",
  "General Maintenance",
  "Locksmith",
  "HVAC / Air Con",
  "Waterproofing",
  "Gardening / Landscaping",
  "Cleaning",
  "Security",
  "Pest Control",
  "Roofing",
  "Glass & Glazing",
  "Appliance Repair",
]
