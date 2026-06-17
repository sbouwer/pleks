/**
 * lib/screening/decisionReasonsSql.ts — generate the F3 decision-reason CHECK constraints from the canonical TS
 *
 * Data:   pure — turns the decisionReasons.ts arrays into the SPEC §2.2 migration SQL. No DB/fs access.
 * Notes:  Single generator consumed by BOTH the codegen script (writes the .generated.sql) and the drift
 *         test (re-generates + compares to the committed file). TypeScript is the source, SQL is the mirror,
 *         drift fails CI (SPEC §7 approach A). Output is a paste-ready 010 §N block — applied only once
 *         counsel ticks the values (see decisionReasons.ts header).
 */
import {
  DECLINE_REASON_CODES,
  ADVERSE_FACTOR_CODES,
  NOT_SHORTLISTED_REASON_CODES,
  WITHDRAWN_REASON_CODES,
} from "./decisionReasons"

/** Render a readonly string[] as an indented SQL IN-list body: `'a',\n    'b'` (no trailing comma). */
function inList(codes: readonly string[]): string {
  return codes.map((c) => `    '${c}'`).join(",\n")
}

/**
 * The full SPEC §2.2 migration block as a string. Deterministic — same arrays in → same SQL out.
 * Generated; do not hand-edit the emitted .sql (edit decisionReasons.ts and re-run the codegen).
 */
export function buildDecisionReasonConstraintsSql(): string {
  return `-- ═══════════════════════════════════════════════════════════════════════════════
-- §N  BUILD_F3_DECISION_REASONS: code-typed decision/adverse-factor fields
--     GENERATED from lib/screening/decisionReasons.ts — do not hand-edit (edit the TS + re-run
--     scripts/codegen/decision-reason-enums.mts). Values are CD-draft; APPLY ONLY after counsel ticks.
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE applications
  ADD COLUMN IF NOT EXISTS decline_reason_code text,
  ADD COLUMN IF NOT EXISTS adverse_factor_codes text[],
  ADD COLUMN IF NOT EXISTS not_shortlisted_reason_code text,
  ADD COLUMN IF NOT EXISTS withdrawn_reason_code text;

ALTER TABLE application_co_applicants
  ADD COLUMN IF NOT EXISTS decline_reason_code text,
  ADD COLUMN IF NOT EXISTS adverse_factor_codes text[];

ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_decline_reason_code_check;
ALTER TABLE applications ADD CONSTRAINT applications_decline_reason_code_check CHECK (
  decline_reason_code IS NULL OR decline_reason_code IN (
${inList(DECLINE_REASON_CODES)}
  )
);

ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_not_shortlisted_reason_code_check;
ALTER TABLE applications ADD CONSTRAINT applications_not_shortlisted_reason_code_check CHECK (
  not_shortlisted_reason_code IS NULL OR not_shortlisted_reason_code IN (
${inList(NOT_SHORTLISTED_REASON_CODES)}
  )
);

ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_withdrawn_reason_code_check;
ALTER TABLE applications ADD CONSTRAINT applications_withdrawn_reason_code_check CHECK (
  withdrawn_reason_code IS NULL OR withdrawn_reason_code IN (
${inList(WITHDRAWN_REASON_CODES)}
  )
);

CREATE OR REPLACE FUNCTION is_valid_adverse_factor_code(p_code text)
RETURNS boolean AS $$
BEGIN
  RETURN p_code IN (
${inList(ADVERSE_FACTOR_CODES)}
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE SET search_path = public;

-- Array wrapper: a CHECK constraint cannot contain a subquery, so the per-element validation lives in
-- this function (subqueries ARE allowed inside a function body) and the CHECK calls it scalar-wise.
CREATE OR REPLACE FUNCTION is_valid_adverse_factor_array(p_codes text[])
RETURNS boolean AS $$
BEGIN
  RETURN p_codes IS NULL OR (SELECT bool_and(is_valid_adverse_factor_code(c)) FROM unnest(p_codes) AS c);
END;
$$ LANGUAGE plpgsql IMMUTABLE SET search_path = public;

ALTER TABLE applications DROP CONSTRAINT IF EXISTS applications_adverse_factor_codes_check;
ALTER TABLE applications ADD CONSTRAINT applications_adverse_factor_codes_check CHECK (
  is_valid_adverse_factor_array(adverse_factor_codes)
);

ALTER TABLE application_co_applicants DROP CONSTRAINT IF EXISTS application_co_applicants_decline_reason_code_check;
ALTER TABLE application_co_applicants ADD CONSTRAINT application_co_applicants_decline_reason_code_check CHECK (
  decline_reason_code IS NULL OR decline_reason_code IN (
${inList(DECLINE_REASON_CODES)}
  )
);

ALTER TABLE application_co_applicants DROP CONSTRAINT IF EXISTS application_co_applicants_adverse_factor_codes_check;
ALTER TABLE application_co_applicants ADD CONSTRAINT application_co_applicants_adverse_factor_codes_check CHECK (
  is_valid_adverse_factor_array(adverse_factor_codes)
);

COMMENT ON COLUMN applications.decline_reason_code IS
  'Primary decline reason code (CD-canonical enum, counsel-confirmed). One per declined application. Retained 5 years post-decision as part of F3 structurally-typed accountability record.';
COMMENT ON COLUMN applications.adverse_factor_codes IS
  'Array of adverse factor codes contributing to the decision (CD-canonical enum, counsel-confirmed). Retained 5 years post-decision. Multiple codes per row allowed; ordering not significant.';
COMMENT ON COLUMN applications.decline_reason IS
  'DEPRECATED: free-text legacy field. Use decline_reason_code (categorical). Backfilled per SPEC §8. Dropped after backfill verified.';
COMMENT ON COLUMN applications.not_shortlisted_reason IS
  'DEPRECATED: free-text legacy field. Use not_shortlisted_reason_code (categorical). Dropped after backfill verified.';
COMMENT ON COLUMN application_co_applicants.decline_reason IS
  'DEPRECATED: free-text legacy field. Use decline_reason_code (categorical). Dropped after backfill verified.';
`
}
