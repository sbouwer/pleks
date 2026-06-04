/**
 * lib/audit/recordAudit.ts — the single canonical audit-log writer (ADDENDUM_AUDIT_HARDENING D-1/D-2)
 *
 * Auth:   server-only; the caller has already authorised + resolved the actor + org
 * Data:   audit_log (append-only) — writes the REAL columns: org_id, table_name, record_id, action,
 *         changed_by, actor_name, old_values, new_values, ip_address, user_agent
 * Notes:  Every important (T1/T2) mutation should route through here instead of a hand-written
 *         `from("audit_log").insert(...)`. Two structural guarantees the raw inserts didn't have:
 *           1. It writes only real columns (the F0 class — phantom `user_id`/`event_type`/`values`
 *              inserts silently 42703'd; here the shape is fixed in one place + error-checked).
 *           2. PII is sanitised by denylist BEFORE write (SECURITY RULE #7): never-log keys are dropped,
 *              account/card/IBAN numbers are masked to last-4 — so "PII in audit values" is structurally
 *              hard, not a per-caller discipline.
 *         `action` stays the coarse column enum (INSERT/UPDATE/DELETE); the SEMANTIC descriptor
 *         (e.g. "bank_account_changed", "popia_erasure") goes in `after.action` — the existing convention.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { logQueryError } from "@/lib/supabase/logQueryError"

/** The audit_log.action column enum. Semantic intent lives in `after.action`, not here. */
export type AuditAction = "INSERT" | "UPDATE" | "DELETE"

export interface RecordAuditInput {
  orgId: string
  /** auth.users id of the actor (changed_by). null only for system/cron actors. */
  actorId: string | null
  action: AuditAction
  table: string
  recordId: string
  before?: Record<string, unknown> | null
  after?: Record<string, unknown> | null
  /** denormalised display name (audit_log.actor_name); optional — pass when already resolved. */
  actorName?: string | null
  context?: { ipAddress?: string | null; userAgent?: string | null }
}

/** Keys whose values are DROPPED entirely before write — raw identifiers / secrets / decrypted PII. */
const NEVER_LOG = new Set<string>([
  "id_number", "id_number_hash", "id_number_decrypted",
  "password", "password_hash", "secret", "token", "access_token", "refresh_token",
  "cvv", "pin", "account_number_decrypted",
])

/** Keys MASKED to last-4 (so the audit still says WHICH account, never the full number). */
const MASK_LAST4 = new Set<string>(["account_number", "iban", "card_number"])

/** Strip never-log keys and mask account-number-like keys. Shallow — audit payloads are flat. */
function sanitise(values: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!values) return null
  const out: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(values)) {
    if (MASK_LAST4.has(key)) {
      if (typeof val === "string" && val.length >= 4) out[`${key}_masked`] = `••••${val.slice(-4)}`
      else if (val != null) out[`${key}_masked`] = "••••"
    } else if (NEVER_LOG.has(key)) {
      // dropped — never written to audit_log
    } else {
      out[key] = val
    }
  }
  return out
}

/**
 * Write one audit_log row. Never throws — a failed audit is logged loudly (logQueryError) but does not
 * abort the surrounding mutation. Callers that need audit-or-bust should check the live row in a test.
 */
export async function recordAudit(db: SupabaseClient, input: RecordAuditInput): Promise<void> {
  const { error } = await db.from("audit_log").insert({
    org_id: input.orgId,
    table_name: input.table,
    record_id: input.recordId,
    action: input.action,
    changed_by: input.actorId,
    actor_name: input.actorName ?? null,
    old_values: sanitise(input.before),
    new_values: sanitise(input.after),
    ip_address: input.context?.ipAddress ?? null,
    user_agent: input.context?.userAgent ?? null,
  })
  logQueryError("recordAudit", error)
}

/** Exposed for unit-testing the sanitiser against the NEVER_LOG / MASK_LAST4 sets. */
export const __sanitiseForTest = sanitise
