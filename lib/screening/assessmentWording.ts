/**
 * lib/screening/assessmentWording.ts — counsel-approved sentences about the consolidated assessment, one constant each
 *
 * Notes:  Counsel 2026-10-05 (approved-comms §4a, Q4): the closing sentence is IDENTICAL on the policy page and in the
 *         N6 email — "no shortened variant". So it exists once, here, rendered by the N6 email
 *         (lib/screening/milestoneNotices.ts) and credit check policy §03 (v1.5.1). __tests__/assessmentWording.test.tsx
 *         asserts both render it. A surface that types the words is a second copy that can drift.
 */

/** The consolidated assessment is an input to the agency's evaluation; Pleks makes no tenancy decision. */
export const ASSESSMENT_CLOSING_SENTENCE =
  "The consolidated assessment supports the agency's evaluation; it is not a decision on the application."
