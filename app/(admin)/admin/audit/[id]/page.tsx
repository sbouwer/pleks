/**
 * app/(admin)/admin/audit/[id]/page.tsx — Audit log entry detail with old/new diff viewer
 *
 * Route:  /admin/audit/[id]
 * Auth:   requireAdminAuth() — HMAC pleks_admin_token cookie
 * Data:   getAuditEntry() via service-role
 */
import { requireAdminAuth } from "@/lib/admin/auth"
import { getAuditEntry } from "@/lib/admin/audit-queries"
import { classifyAuditSeverity, SEVERITY_COLORS } from "@/lib/admin/audit-severity"
import { notFound } from "next/navigation"
import Link from "next/link"

function formatDatetime(iso: string): string {
  return new Date(iso).toLocaleString("en-ZA", { dateStyle: "long", timeStyle: "long" })
}

function FieldRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--rule)" }}>
      <div style={{
        width: 160,
        flexShrink: 0,
        padding: "10px 16px",
        fontFamily: "var(--mono)",
        fontSize: 11,
        color: "var(--ink-mute)",
        letterSpacing: "0.04em",
        background: "var(--paper-raised)",
      }}>
        {label}
      </div>
      <div style={{
        flex: 1,
        padding: "10px 16px",
        fontFamily: "var(--mono)",
        fontSize: 12,
        color: "var(--ink)",
        wordBreak: "break-all",
      }}>
        {value ?? <span style={{ color: "var(--ink-faint)" }}>—</span>}
      </div>
    </div>
  )
}

function DiffPanel({ title, values, accent }: {
  title: string
  values: Record<string, unknown> | null
  accent: string
}) {
  if (!values) return (
    <div style={{
      flex: 1,
      border: "1px solid var(--rule)",
      borderRadius: "var(--r-md)",
      overflow: "hidden",
    }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--rule)", background: "var(--paper-raised)" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink-mute)" }}>{title}</span>
      </div>
      <div style={{ padding: "16px", color: "var(--ink-faint)", fontSize: 13 }}>null</div>
    </div>
  )

  const entries = Object.entries(values)

  return (
    <div style={{
      flex: 1,
      border: `1px solid var(--rule)`,
      borderTop: `3px solid ${accent}`,
      borderRadius: "var(--r-md)",
      overflow: "hidden",
    }}>
      <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--rule)", background: "var(--paper-raised)" }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--ink)" }}>{title}</span>
      </div>
      <div style={{ overflowX: "auto" }}>
        {entries.map(([k, v]) => (
          <div key={k} style={{ display: "flex", borderBottom: "1px solid var(--rule)" }}>
            <div style={{
              width: 160,
              flexShrink: 0,
              padding: "8px 14px",
              fontFamily: "var(--mono)",
              fontSize: 11,
              color: "var(--ink-mute)",
              background: "var(--paper-raised)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}>
              {k}
            </div>
            <div style={{
              flex: 1,
              padding: "8px 14px",
              fontFamily: "var(--mono)",
              fontSize: 12,
              color: "var(--ink)",
              wordBreak: "break-all",
              whiteSpace: "pre-wrap",
            }}>
              {v === null ? <span style={{ color: "var(--ink-faint)" }}>null</span> : String(v)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function actionBackground(action: string): string {
  if (action === "DELETE") return "var(--critical-wash)"
  if (action === "INSERT") return "var(--positive-wash)"
  return "var(--slate-wash)"
}

function actionColor(action: string): string {
  if (action === "DELETE") return "var(--critical)"
  if (action === "INSERT") return "var(--positive)"
  return "var(--ink-soft)"
}

export default async function AuditDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminAuth()
  const { id } = await params
  const entry = await getAuditEntry(id)
  if (!entry) notFound()

  const severity = classifyAuditSeverity(entry)
  const color = SEVERITY_COLORS[severity]

  return (
    <div style={{ maxWidth: 1100 }}>
      {/* Back link */}
      <Link href="/admin/audit" style={{ fontSize: 12.5, color: "var(--ink-mute)", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6, marginBottom: 20 }}>
        ← Audit log
      </Link>

      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: "var(--ink)", letterSpacing: "-0.01em" }}>
          {entry.table_name}
        </h1>
        <span style={{
          fontFamily: "var(--mono)",
          fontSize: 10.5,
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          fontWeight: 500,
          padding: "3px 10px",
          borderRadius: 999,
          background: actionBackground(entry.action),
          color: actionColor(entry.action),
        }}>
          {entry.action}
        </span>
        <span style={{
          fontFamily: "var(--mono)",
          fontSize: 10.5,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          fontWeight: 500,
          padding: "3px 10px",
          borderRadius: 999,
          border: `1px solid color-mix(in oklch, ${color} 40%, transparent)`,
          color,
        }}>
          {severity}
        </span>
      </div>

      {/* Meta fields */}
      <div style={{
        border: "1px solid var(--rule)",
        borderRadius: "var(--r-md)",
        overflow: "hidden",
        marginBottom: 24,
      }}>
        <FieldRow label="id"         value={entry.id} />
        <FieldRow label="org"        value={entry.org_name ?? entry.org_id} />
        <FieldRow label="record_id"  value={entry.record_id} />
        <FieldRow label="changed_by" value={entry.changed_by ?? "system"} />
        <FieldRow label="when"       value={formatDatetime(entry.created_at)} />
        <FieldRow label="ip_address" value={entry.ip_address} />
        <FieldRow label="user_agent" value={entry.user_agent} />
      </div>

      {/* Old / New diff */}
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        <DiffPanel title="old_values" values={entry.old_values} accent="var(--critical)" />
        <DiffPanel title="new_values" values={entry.new_values} accent="var(--positive)" />
      </div>
    </div>
  )
}
