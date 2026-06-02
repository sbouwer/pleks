/**
 * lib/contacts/contactScope.ts — the single source of truth for "top-level contact" scoping (ADDENDUM_25A §9)
 *
 * Company "people" are individual `contacts` rows with `organisation_contact_id` set (pointing at their
 * company contact) and `primary_role='company_contact'`. They must NEVER appear as standalone entries in
 * any contact list/picker, and search must match a person but resolve to (open) the parent organisation.
 *
 * Most enumeration is already role-scoped (the `*_view`s + role tables exclude `company_contact`), so this
 * is the canonical predicate for the few sites that query `contacts` directly (offline sync-manifest +
 * reference cache). Route any new "list/pick/search contacts" site through here — don't re-implement.
 */

/** The FK column that marks a contact as a sub-person under an organisation contact. */
export const SUB_PERSON_FK = "organisation_contact_id"

/** True if a fetched/cached contact is a company sub-person (not a top-level contact). */
export function isSubPerson(c: Readonly<{ organisation_contact_id?: string | null }>): boolean {
  return c.organisation_contact_id != null
}

/**
 * The display label for a person's company function (mirrors COMPANY_FUNCTION_OPTIONS) — used when a
 * search match resolves to the org and we hint which person matched ("Acme — matched Jane · Maintenance").
 */
export const COMPANY_FUNCTION_LABEL: Record<string, string> = {
  owner_director: "Owner / Director",
  account_manager: "Account manager",
  accounts: "Accounts",
  maintenance: "Maintenance",
  leasing: "Leasing",
  other: "Contact",
}
