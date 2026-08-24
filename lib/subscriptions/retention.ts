/**
 * lib/subscriptions/retention.ts — Post-purge retention map (ADDENDUM_57G §X.5)
 *
 * Notes:  On purge, listed tables have org_id repointed to SENTINEL_ORG_ID;
 *         everything else is hard-deleted in dependency order. That behaviour lives in
 *         purge_org_cascade() (SQL), NOT here — see the array's own comment below.
 *
 *         This header said "Shared by ADDENDUM_57G and BUILD_65. One retention map, two callers."
 *         until 2026-08-23. It was the THIRD artefact asserting this array is live (M-082 had
 *         already caught the other two) and the last one standing, having survived the pass that
 *         corrected the array's comment — a file-level header and a symbol-level comment rot
 *         independently, which is why CLAUDE.md §8 says reconcile the WHOLE file.
 */

/** UUID of the __purged__ sentinel org — seeded in 006_seed.sql §X.5. */
export const SENTINEL_ORG_ID = "00000000-0000-0000-0000-000000000001" as const

/**
 * Tables whose rows survive a purge by repointing org_id to the sentinel.
 *
 * Retention obligations:
 *   audit_log                    — immutable audit (platform charter, non-negotiable)
 *   trust_transactions           — PPRA 5-year retention
 *   trust_reconciliation_periods — PPRA 5-year retention
 *   consent_log                  — POPIA proof-of-consent
 *   auth_events                  — 7-year auth-event retention (BUILD_62)
 *   tos_acceptances              — 10-year ToS acceptance record (POPIA s17 accountability)
 *
 * ⚠ NOTHING IMPORTS THIS ARRAY AT RUNTIME — still true, and deliberately still stated. The sentence
 * that stood here said "BUILD_65 imports this array rather than defining its own"; it was false when
 * written or became false silently, and it is removed rather than corrected-below, because a reader
 * who greps this file must not find an assertion of liveness at all.
 *
 * What DOES read it, since 2026-08-23: `scripts/check-retention-skiplist.mts`, on `npm run check`.
 * It asserts this array matches BOTH copies of the same list inside purge_org_cascade() — the Step 1
 * repoint block and the Step 2 exclusion list — so editing this array without editing the SQL (or
 * either SQL copy without the other) goes red. **A check is not a caller**: the purge still does not
 * derive its behaviour from these six strings, it is merely forbidden to disagree with them. That
 * distinction is why M-082's baseline entry stays.
 *
 * Deriving it by import is not available as a fix and never was: purge_org_cascade is a SQL
 * SECURITY DEFINER function, and no SQL function can import a TypeScript array.
 *
 * The knip-suppression tag that sat here was REMOVED on 2026-08-23, and not because the finding
 * went away. check-retention-skiplist.mts imports this array, so knip now sees a reader and stops
 * reporting the export — which left the tag on a symbol knip never reports, and `check-knip-floor`
 * caught the parity break on the first run. If that check is ever deleted, knip will report this
 * export again, which is the correct outcome: the tag's job was to record WHY an unused export is
 * not dead code (a PPRA/POPIA retention list — deleting it removes the record and leaves the
 * obligation), and that reason belongs to the state where it has no reader.
 *
 * This paragraph deliberately does NOT spell the tag out. Writing it as prose is indistinguishable
 * from writing it as a tag to the grep behind `check-knip-floor`, so the sentence explaining the
 * removal would itself have re-created the parity break — which is exactly what happened on the
 * first attempt at this comment, and is the FOURTH time this repo has been bitten by a token
 * written in prose (CLAUDE.md §8: never author a pattern where a scanner will read it as one).
 *
 * @invariant M-082 — declared to check-invariant-has-callers, currently baselined as unread. The
 * failure this guards is one-directional and silent: a purge that should skip `consent_log` skips
 * it only if the purge author happened to hardcode the same list, and the evidence of the omission
 * is the ABSENCE of rows.
 */
export const RETENTION_PROTECTED_TABLES = [
  "audit_log",
  "trust_transactions",
  "trust_reconciliation_periods",
  "consent_log",
  "auth_events",
  "tos_acceptances",
] as const
