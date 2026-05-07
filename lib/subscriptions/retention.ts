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
 *
 * BUILD_65 imports this array rather than defining its own.
 */
export const RETENTION_PROTECTED_TABLES = [
  "audit_log",
  "trust_transactions",
  "trust_reconciliation_periods",
  "consent_log",
  "auth_events",
] as const

export type RetentionProtectedTable = (typeof RETENTION_PROTECTED_TABLES)[number]
