/**
 * lib/admin/audit-severity.ts — Derives display severity from audit_log row fields
 *
 * Auth:   Server-only helper — called from audit query results
 * Notes:  Severity is derived per-render, not stored. Changing a rule here updates
 *         how all historical entries display. Rules are intentionally explicit —
 *         add a new entry to extend, no schema changes needed.
 */

export type AuditSeverity = "low" | "medium" | "high"

export interface AuditLogRow {
  id: string
  org_id: string | null
  table_name: string
  record_id: string | null
  action: string
  changed_by: string | null
  old_values: Record<string, unknown> | null
  new_values: Record<string, unknown> | null
  ip_address: string | null
  user_agent: string | null
  created_at: string
}

interface SeverityRule {
  table: string
  action?: "INSERT" | "UPDATE" | "DELETE"
  newValuesMatch?: (v: Record<string, unknown>) => boolean
}

const HIGH_SEVERITY_RULES: SeverityRule[] = [
  { table: "user_orgs",    action: "UPDATE", newValuesMatch: (v) => v.action === "ownership_transfer" },
  { table: "user_orgs",    action: "UPDATE", newValuesMatch: (v) => v.role === "owner" },
  { table: "leases",       action: "DELETE" },
  { table: "organisations",action: "DELETE" },
  { table: "deposit_refunds",   action: "INSERT" },
  { table: "trust_transactions" },
  { table: "subscriptions",     newValuesMatch: (v) => v.status === "cancelled" },
  { table: "bank_accounts", action: "UPDATE" },
  { table: "bank_accounts", action: "INSERT" },
  { table: "step_up_challenges" },
  { table: "data_subject_requests" },
]

const MEDIUM_SEVERITY_TABLES = new Set([
  "subscriptions",
  "payments",
  "lease_charges",
  "invoices",
  "consent_log",
  "popia_exports",
  "deposit_deduction_items",
  "deposit_refunds",
])

export function classifyAuditSeverity(entry: AuditLogRow): AuditSeverity {
  for (const rule of HIGH_SEVERITY_RULES) {
    if (rule.table !== entry.table_name) continue
    if (rule.action && rule.action !== entry.action) continue
    if (rule.newValuesMatch && !rule.newValuesMatch(entry.new_values ?? {})) continue
    return "high"
  }
  if (MEDIUM_SEVERITY_TABLES.has(entry.table_name)) return "medium"
  return "low"
}

export const SEVERITY_COLORS: Record<AuditSeverity, string> = {
  high:   "var(--critical)",
  medium: "var(--caution)",
  low:    "var(--slate)",
}

export const SEVERITY_BG: Record<AuditSeverity, string> = {
  high:   "var(--critical-wash)",
  medium: "var(--caution-wash)",
  low:    "var(--slate-wash)",
}
