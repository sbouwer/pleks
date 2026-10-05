/**
 * lib/screening/assessmentWording.ts — counsel-approved sentences about the consolidated assessment, one constant each
 *
 * Notes:  Counsel 2026-10-05 (approved-comms §4a, Q4): the closing sentence is IDENTICAL on the policy page and in the
 *         N6 email — "no shortened variant". So it exists once, here. As at P4b its only renderer is the N6 email
 *         (lib/screening/milestoneNotices.ts); the policy page's §171 reword (v1.5.1, 14X P5) must import it rather than
 *         type the words, and nothing yet forces that. A surface that types them is a second copy that can drift.
 */

/** The consolidated assessment is an input to the agency's evaluation; Pleks makes no tenancy decision. */
export const ASSESSMENT_CLOSING_SENTENCE =
  "The consolidated assessment supports the agency's evaluation; it is not a decision on the application."
