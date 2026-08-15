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

/** Human labels for the mandatory storage columns — for the first-touch prompt + the burn-down surface (§3/§6). */
export const MANDATORY_FIELD_LABELS: Record<string, string> = {
  first_name: "first name", last_name: "last name", primary_email: "email", primary_phone: "phone",
  address_line1: "address", city: "city", province: "province",
  start_date: "lease start date", rent_amount_cents: "rent",
}

/** "address, city and province" — a plain-language list of missing fields for a prompt. Empty ⇒ "". */
export function describeMissingFields(fields: string[]): string {
  const words = fields.map((f) => MANDATORY_FIELD_LABELS[f] ?? f.replaceAll("_", " "))
  if (words.length <= 1) return words[0] ?? ""
  return `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`
}

/** A value counts as ABSENT when it is null/undefined, NaN (a failed numeric parse — e.g. a blank rent field that
 *  became `Number.parseFloat("") * 100`), an empty/whitespace string, or an empty array. A real 0 is PRESENT. */
export function isFieldBlank(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === "number") return Number.isNaN(value)
  if (typeof value === "string") return value.trim() === ""
  if (Array.isArray(value)) return value.length === 0
  return false
}

/**
 * A contact's name is satisfied by a `company_name` (a juristic) OR by `first_name` + `last_name` (a natural
 * person) — a company legitimately has null first/last, so flagging those would be wrong. Email + phone are
 * required either way. This is the one entity whose floor is conditional, so it is not a flat field list.
 */
function missingContactFields(record: Record<string, unknown>): string[] {
  const missing: string[] = []
  if (isFieldBlank(record.company_name)) {
    if (isFieldBlank(record.first_name)) missing.push("first_name")
    if (isFieldBlank(record.last_name)) missing.push("last_name")
  }
  if (isFieldBlank(record.primary_email)) missing.push("primary_email")
  if (isFieldBlank(record.primary_phone)) missing.push("primary_phone")
  return missing
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
  if (entity === "tenant" || entity === "landlord") return missingContactFields(record)
  return MANDATORY_FIELDS[entity].filter((field) => isFieldBlank(record[field]))
}

/** True when a record satisfies its entity's mandatory floor. */
export function isRecordComplete(entity: CompletableEntity, record: Record<string, unknown>): boolean {
  return missingMandatoryFields(entity, record).length === 0
}

/**
 * The `incomplete_mandatory` column value for an insert — the missing-field SET, or `null` when complete (§5).
 * Spread into an importer insert so the record lands FLAGGED with exactly what it lacks; `null` keeps a complete
 * record clean. This is the ONLY writer of the column — always derived from the registry, never hand-set.
 */
export function incompleteMandatoryColumn(
  entity: CompletableEntity,
  record: Record<string, unknown>,
): { incomplete_mandatory: string[] | null } {
  const missing = missingMandatoryFields(entity, record)
  return { incomplete_mandatory: missing.length ? missing : null }
}
