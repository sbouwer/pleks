/**
 * lib/screening/consentWording.ts — the stage-2 consent's group block and checkbox sentences, one constant each
 *
 * Notes:  Counsel-approved text; editing any of it is a counsel event, never an engineering one. Rendered by
 *         components/consent/ScreeningConsentForm.tsx and asserted by its tests, so the words exist once.
 *         The GROUP BLOCK is two sentences rendered together, only for an application with more than one party, and
 *         recorded by ONE flag, `group_clause_shown` in consent_log.metadata (Stéan 2026-10-05: "group paragraph +
 *         §7 sentence as one block, one flag"):
 *         · the paragraph — approved-comms 2026-10-03 §4, verbatim;
 *         · the completion-status sentence — counsel's own Q1 formulation, 14X milestone pack §7 (one-line nod owed;
 *           it does not block the build — N3 stays held in the registry until it is live for the recipient).
 *         The checkboxes — approved-comms §4 (counsel item 8): the single-party one stays short; the group one carries
 *         the sharing itself, because "as described above" was not accepted as carrying it. Both ship with the 14X N6
 *         build (counsel item 7).
 */

/** Approved-comms §4: the consolidation-and-sharing paragraph. */
export const GROUP_CONSOLIDATION_PARAGRAPH =
  "Where this application includes more than one party, the information provided by the parties will be consolidated into a single assessment for this application, and that consolidated assessment will be shared with the other parties to the application."

/** 14X milestone pack §7: counsel's completion-status sentence, the group block's second sentence. */
export const GROUP_COMPLETION_STATUS_SENTENCE =
  "Where this application includes more than one party, your completion of the required screening and consent steps may be communicated to the other parties while the application remains open."

/** The checkbox for a single-party application. */
export const CONSENT_CHECKBOX_SINGLE = "I consent to the credit and background checks described above."

/** The checkbox for a group application: it consents to the consolidation and the sharing in its own words. */
export const CONSENT_CHECKBOX_GROUP =
  "I consent to the credit and background checks described above and, where this application includes more than one party, to the information provided by the parties being consolidated into a single assessment for this application and that consolidated assessment being shared with the other parties to the application."
