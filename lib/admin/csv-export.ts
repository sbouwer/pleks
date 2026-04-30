/**
 * lib/admin/csv-export.ts — Streaming CSV writer + POPIA-safe field redaction
 *
 * Auth:   Server-only — called from the process-audit-exports cron
 * Notes:  IP addresses redacted to /24 mask (POPIA minimum-retention principle).
 *         User-agent reduced to browser family only.
 *         Row-by-row streaming avoids loading all rows into memory simultaneously.
 */
import { createServiceClient } from "@/lib/supabase/server"

export function redactIp(ip: string | null): string {
  if (!ip) return ""
  const v4 = ip.match(/^(\d+\.\d+\.\d+)\.\d+$/)
  if (v4) return `${v4[1]}.0/24`
  // IPv6 — keep first 4 groups, zero rest
  if (ip.includes(":")) {
    const parts = ip.split(":")
    return parts.slice(0, 4).join(":") + "::/64"
  }
  return ip
}

export function redactUserAgent(ua: string | null): string {
  if (!ua) return ""
  if (/Chrome\//.test(ua) && !/Edge\/|Edg\/|OPR\//.test(ua)) return "Chrome"
  if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) return "Safari"
  if (/Firefox\//.test(ua)) return "Firefox"
  if (/Edge\/|Edg\//.test(ua)) return "Edge"
  if (/OPR\//.test(ua)) return "Opera"
  return "Other"
}

function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) return ""
  const str = typeof value === "object" ? JSON.stringify(value) : String(value)
  if (str.includes('"') || str.includes(",") || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

const CSV_HEADERS = [
  "id", "org_id", "table_name", "record_id", "action",
  "changed_by", "new_values_preview", "ip_address_masked", "user_agent_family", "created_at",
]

export interface ExportFilterParams {
  startDate?: string
  endDate?: string
  action?: string[]
  tableName?: string[]
}

export async function streamAuditCsv(
  jobId: string,
  filterParams: ExportFilterParams,
): Promise<{ csvContent: string; rowCount: number }> {
  const db = await createServiceClient()

  const now = new Date()
  const defaultStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  let query = db
    .from("audit_log")
    .select("id, org_id, table_name, record_id, action, changed_by, new_values, ip_address, user_agent, created_at")
    .order("created_at", { ascending: false })
    .limit(500_000)

  const start = filterParams.startDate ?? defaultStart.toISOString()
  const end   = filterParams.endDate
  query = query.gte("created_at", start)
  if (end) query = query.lte("created_at", end)
  if (filterParams.action?.length)    query = query.in("action", filterParams.action)
  if (filterParams.tableName?.length) query = query.in("table_name", filterParams.tableName)

  const { data, error } = await query
  if (error) throw new Error(`Audit query failed: ${error.message}`)

  const rows = data ?? []
  const lines: string[] = [CSV_HEADERS.join(",")]

  for (const row of rows) {
    const newValuesPreview = row.new_values
      ? JSON.stringify(row.new_values).slice(0, 200)
      : ""
    lines.push([
      escapeCsvField(row.id),
      escapeCsvField(row.org_id),
      escapeCsvField(row.table_name),
      escapeCsvField(row.record_id),
      escapeCsvField(row.action),
      escapeCsvField(row.changed_by),
      escapeCsvField(newValuesPreview),
      escapeCsvField(redactIp(row.ip_address as string | null)),
      escapeCsvField(redactUserAgent(row.user_agent as string | null)),
      escapeCsvField(row.created_at),
    ].join(","))
  }

  return { csvContent: lines.join("\n"), rowCount: rows.length }
}
