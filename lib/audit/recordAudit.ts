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

/**
 * The audit_log.action column enum — the FULL live CHECK (audit_log_action_check), not just the CRUD trio.
 * INSERT/UPDATE/DELETE are the row-lifecycle verbs; NOTE (a recorded observation, e.g. the notice-delivery
 * bridge's short-service flag), SYNC (an external reconciliation), OWNERSHIP_TRANSFERRED and
 * CONFLICT_ACKNOWLEDGED are domain events the CHECK already permits. A caller that needed one of these could
 * not use recordAudit before this widened — which is exactly why they hand-rolled `from("audit_log")`.
 * Semantic detail still lives in `after.action`; this is the coarse column value.
 */
export type AuditAction =
  | "INSERT" | "UPDATE" | "DELETE"
  | "NOTE" | "SYNC" | "OWNERSHIP_TRANSFERRED" | "CONFLICT_ACKNOWLEDGED"

export interface RecordAuditInput {
  orgId: string
  /** auth.users id of the actor (changed_by). null/omitted for system/cron/webhook actors (writes null). */
  actorId?: string | null
  action: AuditAction
  table: string
  recordId: string
  before?: Record<string, unknown> | null
  after?: Record<string, unknown> | null
  /** denormalised display name (audit_log.actor_name); optional — pass when already resolved. */
  actorName?: string | null
  context?: { ipAddress?: string | null; userAgent?: string | null }
}

/** Keys whose values are DROPPED entirely before write — raw identifiers / secrets / decrypted PII.
 *  Encrypted (_enc) and hashed (_hash) variants are still personal data (D-5) — drop them too. */
const NEVER_LOG = new Set<string>([
  "id_number", "id_number_hash", "id_number_enc", "id_number_decrypted",
  "account_number_enc", "account_number_hash", "account_number_decrypted",
  "password", "password_hash", "secret", "token", "access_token", "refresh_token",
  "cvv", "pin",
])

/** Keys MASKED to last-4 (so the audit still says WHICH account, never the full number). */
const MASK_LAST4 = new Set<string>(["account_number", "iban", "card_number"])

/** Contact-PII key names (email / phone / mobile in any form: applicant_email, sent_to_phone, owner_mobile, …).
 *  Dropped like NEVER_LOG (RULE #7 — no PII in audit_log values): the audit already references the data subject by
 *  record_id / entity id, so the raw email/phone adds exposure without accountability value. */
const CONTACT_PII_KEY = /(^|_)(email|phone|mobile|cell|msisdn)($|_)/i

/** VALUE-level backstop: an email address stored under an innocuous key name (e.g. `sent_to`, `recipient`)
 *  slips past the key-name denylist above. A shallow email shape on any string value is redacted to a marker
 *  (key kept, address gone) — so RULE #7 is structural, not "did the caller happen to name the key `email`".
 *  Linear string-ops (no regex backtracking): one `@` not at the edge, a dot in the domain, no whitespace. */
function looksLikeEmail(s: string): boolean {
  const at = s.indexOf("@")
  return at > 0 && at === s.lastIndexOf("@") && !/\s/.test(s) && s.slice(at + 1).includes(".")
}

/** Strip never-log keys, mask account-number-like keys, and redact email-shaped values. Shallow — audit payloads are flat. */
function sanitise(values: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!values) return null
  const out: Record<string, unknown> = {}
  for (const [key, val] of Object.entries(values)) {
    if (MASK_LAST4.has(key)) {
      if (typeof val === "string" && val.length >= 4) out[`${key}_masked`] = `••••${val.slice(-4)}`
      else if (val != null) out[`${key}_masked`] = "••••"
    } else if (NEVER_LOG.has(key) || CONTACT_PII_KEY.test(key)) {
      // dropped — never written to audit_log
    } else if (typeof val === "string" && looksLikeEmail(val.trim())) {
      out[key] = "[redacted-email]"   // value-level PII backstop (misnamed key)
    } else {
      out[key] = val
    }
  }
  return out
}

/** The flat audit_log row shape, built once and shared by both writers below. */
function buildAuditRow(input: RecordAuditInput): Record<string, unknown> {
  return {
    org_id: input.orgId,
    table_name: input.table,
    record_id: input.recordId,
    action: input.action,
    changed_by: input.actorId ?? null,
    actor_name: input.actorName ?? null,
    old_values: sanitise(input.before),
    new_values: sanitise(input.after),
    ip_address: input.context?.ipAddress ?? null,
    user_agent: input.context?.userAgent ?? null,
  }
}

/**
 * Write one audit_log row. Never throws — a failed audit is logged loudly (logQueryError) but does not
 * abort the surrounding mutation. Callers that need audit-or-bust should check the live row in a test.
 */
export async function recordAudit(db: SupabaseClient, input: RecordAuditInput): Promise<void> {
  const { error } = await db.from("audit_log").insert(buildAuditRow(input))
  logQueryError("recordAudit", error)
}

/**
 * Like recordAudit, but returns the inserted `audit_log.id` (or null on failure). Use ONLY where the id
 * must be captured back — e.g. the F3 decision-write path stamps it into
 * `applications.audit_log_decision_entry_id` (decision-accountability anchor, §2.3). A null return means
 * the audit row was not written; the caller treats the backlink as best-effort (the mutation still stands).
 */
export async function recordAuditReturningId(db: SupabaseClient, input: RecordAuditInput): Promise<string | null> {
  const { data, error } = await db.from("audit_log").insert(buildAuditRow(input)).select("id").single()
  logQueryError("recordAuditReturningId", error)
  return (data?.id as string | undefined) ?? null
}

/**
 * Write several audit_log rows in ONE insert statement — atomic (all-or-nothing) and same-order. Use where a
 * single action produces a coupled set of rows that must not partially land, e.g. a state-change UPDATE paired
 * with its human-readable NOTE (the reason is the forensic payload — it must never persist without, or after,
 * its state row). Every row is built + PII-sanitised the same way as recordAudit. Never throws.
 */
export async function recordAuditMany(db: SupabaseClient, inputs: RecordAuditInput[]): Promise<void> {
  if (inputs.length === 0) return
  const { error } = await db.from("audit_log").insert(inputs.map(buildAuditRow))
  logQueryError("recordAuditMany", error)
}

/** Exposed for unit-testing the sanitiser against the NEVER_LOG / MASK_LAST4 sets. */
export const __sanitiseForTest = sanitise
