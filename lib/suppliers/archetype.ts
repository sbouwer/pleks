/**
 * lib/suppliers/archetype.ts — supplier_type → display archetype for the type-flexing supplier detail
 *
 * Notes:  ADDENDUM_SUPPLIER_DETAIL §1. One detail template, three archetypes selected by
 *         contractors.supplier_type (live CHECK: contractor|recurring|both|managing_scheme|utility|other).
 *         The archetype picks the header type-badge, the secondary-left card, and the primary CTA — the rest
 *         of the fixed grid (Organisation · Account profile · Documents · Recent activity) is identical.
 *         Honest-data rule: this only chooses WHICH slots render; each slot renders real/derived data only.
 */
export type SupplierArchetype = "contractor" | "scheme" | "utility"

export interface SupplierArchetypeConfig {
  archetype: SupplierArchetype
  /** header type-badge label next to the title (e.g. "Scheme service"). */
  badgeLabel: string
  /** secondary-left grid card title. */
  secondaryTitle: string
  /** primary header CTA, or null (utility has none). */
  primaryCta: string | null
}

/** Map the raw supplier_type to one of the three display archetypes. */
export function supplierArchetype(supplierType: string | null | undefined): SupplierArchetype {
  if (supplierType === "managing_scheme") return "scheme"
  if (supplierType === "utility") return "utility"
  // contractor | recurring | both | other | null all present as the Contractor archetype.
  return "contractor"
}

const CONFIG: Record<SupplierArchetype, SupplierArchetypeConfig> = {
  contractor: { archetype: "contractor", badgeLabel: "Contractor",     secondaryTitle: "Work orders",       primaryCta: "Assign job" },
  scheme:     { archetype: "scheme",     badgeLabel: "Scheme service",  secondaryTitle: "Schemes serviced",  primaryCta: "Link to lease" },
  utility:    { archetype: "utility",    badgeLabel: "Utility",         secondaryTitle: "Accounts",          primaryCta: null },
}

export function supplierArchetypeConfig(supplierType: string | null | undefined): SupplierArchetypeConfig {
  return CONFIG[supplierArchetype(supplierType)]
}
