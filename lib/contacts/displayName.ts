/**
 * lib/contacts/displayName.ts — canonical contact display name (organisation-aware)
 *
 * Notes:  entity_type is stored as 'individual' | 'organisation' (NOT 'juristic'). The old
 *         `entity_type === "juristic"` checks never matched, so organisation contacts (whose
 *         first/last name are null) fell through to "Unnamed" and were unsearchable by company
 *         name. Prefer company_name whenever present — robust to the entity_type value. Single
 *         source of truth for tenant/landlord/supplier/contractor name rendering in the UI.
 */
export interface NamedContact {
  company_name?: string | null
  first_name?: string | null
  last_name?: string | null
}

/** Organisation → company name; person → "First Last"; empty → `fallback`. */
export function contactDisplayName(c: NamedContact | null | undefined, fallback = "Unnamed"): string {
  const company = c?.company_name?.trim()
  if (company) return company
  const person = `${c?.first_name ?? ""} ${c?.last_name ?? ""}`.trim()
  return person || fallback
}
