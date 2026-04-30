/**
 * app/(admin)/admin/audit/page.tsx — Filterable, paginated audit log viewer
 *
 * Route:  /admin/audit
 * Auth:   requireAdminAuth() — HMAC pleks_admin_token cookie
 * Data:   queryAuditLog() via service-role (bypasses RLS by design — cross-org view)
 * Notes:  Filter state lives in URL search params. AuditFiltersBar (client) updates params;
 *         this server component re-renders with the new filter values.
 */
import { requireAdminAuth } from "@/lib/admin/auth"
import { queryAuditLog, getDistinctTableNames, PAGE_SIZE } from "@/lib/admin/audit-queries"
import { classifyAuditSeverity, SEVERITY_COLORS } from "@/lib/admin/audit-severity"
import { AuditFiltersBar } from "./AuditFiltersBar"
import Link from "next/link"

interface SearchParams {
  start?: string
  end?: string
  action?: string | string[]
  table?: string | string[]
  search?: string
  cursor?: string
}

function actionColor(action: string): string {
  if (action === "DELETE") return "var(--critical)"
  if (action === "INSERT") return "var(--positive)"
  return "var(--ink-soft)"
}

function toArray(v: string | string[] | undefined): string[] {
  if (!v) return []
  return Array.isArray(v) ? v : [v]
}

function formatDatetime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString("en-ZA", { dateStyle: "short", timeStyle: "short" })
}

export default async function AdminAuditPage({ searchParams }: Readonly<{ searchParams: Promise<SearchParams> }>) {
  await requireAdminAuth()
  const params = await searchParams

  const filters = {
    startDate:  params.start,
    endDate:    params.end,
    action:     toArray(params.action),
    tableName:  toArray(params.table),
    search:     params.search,
    cursor:     params.cursor,
  }

  const [{ entries, nextCursor }, tableNames] = await Promise.all([
    queryAuditLog(filters),
    getDistinctTableNames(),
  ])

  // Build pagination URLs
  function buildUrl(cursor?: string | null): string {
    const sp = new URLSearchParams()
    if (params.start)  sp.set("start",  params.start)
    if (params.end)    sp.set("end",    params.end)
    toArray(params.action).forEach((a) => sp.append("action", a))
    toArray(params.table).forEach((t)  => sp.append("table", t))
    if (params.search) sp.set("search", params.search)
    if (cursor)        sp.set("cursor", cursor)
    return `/admin/audit?${sp.toString()}`
  }

  const hasPrev = !!params.cursor
  const hasNext = !!nextCursor

  return (
    <div style={{ display: "flex", gap: 0, minHeight: "calc(100vh - 56px)", margin: "-28px -32px" }}>
      {/* Filter rail */}
      <AuditFiltersBar tableNames={tableNames} />

      {/* Main content */}
      <div style={{ flex: 1, minWidth: 0, padding: "24px 28px", overflowX: "auto" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 20 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: "var(--ink)", letterSpacing: "-0.01em" }}>
            Audit log
          </h1>
          <span style={{
            fontFamily: "var(--mono)",
            fontSize: 11,
            color: "var(--ink-mute)",
            letterSpacing: "0.04em",
          }}>
            {entries.length === PAGE_SIZE ? `${PAGE_SIZE}+ entries` : `${entries.length} entries`}
          </span>
        </div>

        {/* Table */}
        {entries.length === 0 ? (
          <div style={{ padding: "40px 0", textAlign: "center", color: "var(--ink-mute)", fontSize: 14 }}>
            No audit entries match your filters.
          </div>
        ) : (
          <div style={{
            border: "1px solid var(--rule)",
            borderRadius: "var(--r-md)",
            overflow: "hidden",
          }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
              <thead>
                <tr style={{ background: "var(--paper-raised)" }}>
                  {["Severity", "When", "Org", "Table", "Action", "Record", "Changed by"].map((h) => (
                    <th key={h} style={{
                      textAlign: "left",
                      fontFamily: "var(--mono)",
                      fontSize: 10,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      color: "var(--ink-mute)",
                      padding: "10px 14px",
                      borderBottom: "1px solid var(--rule)",
                      fontWeight: 500,
                      whiteSpace: "nowrap",
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => {
                  const severity = classifyAuditSeverity(entry)
                  const color = SEVERITY_COLORS[severity]
                  return (
                    <tr
                      key={entry.id}
                      style={{ borderBottom: "1px solid var(--rule)" }}
                    >
                      {/* Severity indicator */}
                      <td style={{ padding: "10px 14px", borderLeft: `3px solid ${color}` }}>
                        <span style={{
                          fontFamily: "var(--mono)",
                          fontSize: 10,
                          letterSpacing: "0.08em",
                          textTransform: "uppercase",
                          color,
                          fontWeight: 500,
                        }}>
                          {severity}
                        </span>
                      </td>

                      <td style={{ padding: "10px 14px", color: "var(--ink-mute)", whiteSpace: "nowrap", fontFamily: "var(--mono)", fontSize: 11.5 }}>
                        {formatDatetime(entry.created_at)}
                      </td>

                      <td style={{ padding: "10px 14px", color: "var(--ink-soft)", maxWidth: 140 }}>
                        <span title={entry.org_id ?? undefined} style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {entry.org_name ?? entry.org_id?.slice(0, 8) ?? "—"}
                        </span>
                      </td>

                      <td style={{ padding: "10px 14px", fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--ink)" }}>
                        {entry.table_name}
                      </td>

                      <td style={{ padding: "10px 14px" }}>
                        <span style={{
                          fontFamily: "var(--mono)",
                          fontSize: 10.5,
                          letterSpacing: "0.06em",
                          textTransform: "uppercase",
                          color: actionColor(entry.action),
                        }}>
                          {entry.action}
                        </span>
                      </td>

                      <td style={{ padding: "10px 14px", fontFamily: "var(--mono)", fontSize: 11, color: "var(--ink-mute)", maxWidth: 160 }}>
                        <Link
                          href={`/admin/audit/${entry.id}`}
                          style={{ color: "var(--ink-soft)", textDecoration: "none" }}
                        >
                          <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {entry.record_id ?? "—"}
                          </span>
                        </Link>
                      </td>

                      <td style={{ padding: "10px 14px", color: "var(--ink-mute)", fontSize: 11.5, maxWidth: 160 }}>
                        <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {entry.changed_by ?? "system"}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, padding: "0 2px" }}>
          <div>
            {hasPrev && (
              <Link
                href={buildUrl(null)}
                style={{
                  fontSize: 12.5,
                  color: "var(--ink-soft)",
                  textDecoration: "none",
                  padding: "6px 12px",
                  border: "1px solid var(--rule-strong)",
                  borderRadius: "var(--r-sm)",
                }}
              >
                ← First page
              </Link>
            )}
          </div>
          <div>
            {hasNext && (
              <Link
                href={buildUrl(nextCursor)}
                style={{
                  fontSize: 12.5,
                  color: "var(--ink)",
                  textDecoration: "none",
                  padding: "6px 12px",
                  border: "1px solid var(--rule-strong)",
                  borderRadius: "var(--r-sm)",
                  fontWeight: 500,
                }}
              >
                Next {PAGE_SIZE} →
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
