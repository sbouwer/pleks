/**
 * lib/migration/mandatoryFields.ts — the mandatory-fields registry (ADDENDUM_21E §4, the SSOT)
 *
 * Notes:  ONE list per entity of the fields that are mandatory, with THREE readers so "mandatory" can never drift:
 *           (a) live-create strictness (§1) — the server actions + PATCH routes refuse a missing field;
 *           (b) import-completeness marking (§5/§7) — the importer records WHICH of these are absent per record;
 *           (c) first-touch / action-gate enforcement (§3/§3A) — what a detail page requires before an edit/action.
 *
 *         Named `mandatoryFields`, NOT `completeness` — the word is already taken twice (BUILD_60's
 *         `computePropertyCompleteness`, BUILD_69's `journeyCompleteness`), both unrelated to migration.
 *
 *         Fields are named by their STORAGE column (the flag lives on the record and detail pages read the row),
 *         and the list is the DB NOT-NULL floor reconciled across the three disagreeing definitions the grounding
 *         found (property: DB CHECK vs PropertyForm vs the wizard's `validatePayload`). The floor is what every
 *         create path must satisfy, so it is the safe SSOT; the registry is that floor, once.
 */

/** The entities that can be incomplete-by-migration. Tenant + landlord are both `contacts` rows. */
export type CompletableEntity = "property" | "tenant" | "landlord" | "lease"

/**
 * The mandatory fields per entity, by storage column. Import relaxes these (§1); live-create refuses them (§1);
 * a record missing any of them is a burn-down item until filled (§5/§6).
 */
export const MANDATORY_FIELDS: Record<CompletableEntity, readonly string[]> = {
  // DB NOT NULL floor (003_properties): name + address_line1 + city + province. The wizard/PropertyForm each check
  // a SUBSET; the DB floor is the reconciled superset every create path must meet.
  property: ["name", "address_line1", "city", "province"],
  // partyValidation.validateIdentityCore (live add-tenant/landlord): a person needs a name and a way to reach them.
  tenant: ["first_name", "last_name", "primary_email", "primary_phone"],
  landlord: ["first_name", "last_name", "primary_email", "primary_phone"],
  // DB NOT NULL floor (004_leases_financials): a lease needs when it starts and what it costs.
  lease: ["start_date", "rent_amount_cents"],
} as const

/** A value counts as ABSENT when it is null/undefined, an empty/whitespace string, or an empty array. */
export function isFieldBlank(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === "string") return value.trim() === ""
  if (Array.isArray(value)) return value.length === 0
  return false
}

/**
 * Which mandatory fields are absent on a record — the `incomplete_mandatory` set (§5). Empty ⇒ complete. Reads the
 * record by the registry's storage-column names, so the SAME call serves import-marking, the server-side create
 * gate, and first-touch enforcement. Never a hand-maintained second list.
 */
export function missingMandatoryFields(
  entity: CompletableEntity,
  record: Record<string, unknown>,
): string[] {
  return MANDATORY_FIELDS[entity].filter((field) => isFieldBlank(record[field]))
}

/** True when a record satisfies its entity's mandatory floor. */
export function isRecordComplete(entity: CompletableEntity, record: Record<string, unknown>): boolean {
  return missingMandatoryFields(entity, record).length === 0
}
