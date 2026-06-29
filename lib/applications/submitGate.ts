/**
 * lib/applications/submitGate.ts — the all-green peer-submit gate (ADDENDUM_14R §4 / J1 joint applications).
 *
 * One submission applies to the WHOLE joint application, so it can't go in half-complete: EVERY peer must have
 * finished their own section before ANYONE submits for the group. Full peers (14R) — the lead (the applications
 * row) is counted exactly the same as every co-applicant. Pure so this legal gate is unit-tested independently of
 * the submit-to-agent route that enforces it.
 */
export function incompleteApplicantCount(leadComplete: boolean, coComplete: ReadonlyArray<boolean>): number {
  return (leadComplete ? 0 : 1) + coComplete.filter((done) => !done).length
}
