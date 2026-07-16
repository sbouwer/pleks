/**
 * lib/migration/mandatoryGate.ts — the ONE validated write gate (ADDENDUM_21E §1)
 *
 * Notes:  Every writer to contacts/properties/leases passes through this ONE function so there is a single code
 *         path with a single explicit exemption — never two paths that drift (CD §1 addendum). It reads the §4
 *         registry (the same list the client validator reads), so "mandatory" cannot disagree between the create
 *         path and the completion prompt.
 *
 *           relax: false  → LIVE-CREATE. A missing mandatory field THROWS — the server refusal that, now the DB
 *                           NOT-NULL floor is gone (address relaxed in 012), is the ONLY gate. An incomplete
 *                           record therefore has exactly ONE provenance: import.
 *           relax: true   → IMPORT / onboarding identity-mirror. A missing field does NOT throw — the record
 *                           lands FLAGGED (`incomplete_mandatory`) so it is on the burn-down, never off it.
 *
 *         Either way the return is the `incomplete_mandatory` column value to write (the missing SET, or null).
 */
import { type CompletableEntity, missingMandatoryFields } from "./mandatoryFields"

/** Thrown by a live-create path (relax:false) when a mandatory field is absent. Carries the missing SET so the
 *  caller can surface exactly what to add — the same message the first-touch prompt will show. */
export class MissingMandatoryFieldsError extends Error {
  readonly entity: CompletableEntity
  readonly missing: string[]
  constructor(entity: CompletableEntity, missing: string[]) {
    super(`Missing required ${entity} field(s): ${missing.join(", ")}.`)
    this.name = "MissingMandatoryFieldsError"
    this.entity = entity
    this.missing = missing
  }
}

/**
 * Validate a record against its entity's mandatory floor and return the `incomplete_mandatory` column value.
 * Live-create (`relax:false`) THROWS on a missing field; import / identity-mirror (`relax:true`) lands it flagged.
 * Spread the return into the insert: `.insert({ ...fields, ...mandatoryGate(entity, fields, { relax }) })`.
 */
export function mandatoryGate(
  entity: CompletableEntity,
  record: Record<string, unknown>,
  opts: { relax: boolean },
): { incomplete_mandatory: string[] | null } {
  const missing = missingMandatoryFields(entity, record)
  if (missing.length > 0 && !opts.relax) throw new MissingMandatoryFieldsError(entity, missing)
  return { incomplete_mandatory: missing.length > 0 ? missing : null }
}

/**
 * Recompute the `incomplete_mandatory` column for a PARTIAL edit (corollary 12): merge the update over the record's
 * existing mandatory values and re-derive the flag. Keeps the flag accurate so it never DRIFTS — filling the last
 * missing field on an import-incomplete record clears it. Does not throw (a partial PATCH can't be validated as a
 * full record); the primary full-form edit path refuses a blank via `mandatoryGate(..., { relax: false })`.
 */
export function recomputeIncompleteMandatory(
  entity: CompletableEntity,
  existing: Record<string, unknown>,
  update: Record<string, unknown>,
): { incomplete_mandatory: string[] | null } {
  return mandatoryGate(entity, { ...existing, ...update }, { relax: true })
}
