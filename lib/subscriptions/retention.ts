/**
 * lib/subscriptions/retention.ts — Post-purge retention map (ADDENDUM_57G §X.5)
 *
 * Notes:  Shared by ADDENDUM_57G (operator-driven purge) and BUILD_65
 *         (POPIA user-initiated erasure). One retention map, two callers.
 *         On purge, listed tables have org_id repointed to SENTINEL_ORG_ID;
 *         everything else is hard-deleted in dependency order.
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
 * ⚠ NOTHING IMPORTS THIS ARRAY. The sentence that stood here said "BUILD_65 imports this array
 * rather than defining its own"; it was false when written or became false silently, and it is
 * removed rather than corrected-below, because a reader who greps this file must not find an
 * assertion of liveness at all. `supabase/migrations/010_platform_features.sql:1690` carries the
 * same false claim in the other direction ("Added to RETENTION_PROTECTED_TABLES").
 *
 * @knipignore Kept because it is a PPRA/POPIA retention list, not dead code: deleting it removes
 * the record and leaves the obligation. Filed as M-082.
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
