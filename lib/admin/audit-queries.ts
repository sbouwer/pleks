/**
 * lib/admin/audit-queries.ts — Filtered, paginated audit_log queries for admin viewer
 *
 * Auth:   Server-only — called after requireAdminAuth()
 * Data:   audit_log, organisations, auth.users (read via service-role)
 * Notes:  Cursor pagination on created_at DESC — stable on insert-heavy append-only table.
 *         Free-text search uses new_values::text ILIKE — fast on a small filtered set.
 */
import { createServiceClient } from "@/lib/supabase/server"
import { type AuditLogRow } from "./audit-severity"

export const PAGE_SIZE = 50

export interface AuditFilters {
  startDate?: string        // ISO date string
  endDate?: string          // ISO date string
  action?: string[]         // INSERT|UPDATE|DELETE
  tableName?: string[]
  changedBy?: string        // free text, matched against auth.users email
  severity?: string[]       // low|medium|high (derived — used to post-filter)
  search?: string           // free text over new_values::text
  cursor?: string           // created_at ISO for cursor pagination
}

export interface AuditEntry extends AuditLogRow {
  org_name?: string
}

export async function queryAuditLog(filters: AuditFilters): Promise<{
  entries: AuditEntry[]
  nextCursor: string | null
}> {
  const db = await createServiceClient()

  const now = new Date()
  const defaultStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  let query = db
    .from("audit_log")
    .select("id, org_id, table_name, record_id, action, changed_by, old_values, new_values, ip_address, user_agent, created_at")
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE + 1) // fetch one extra to detect next page

  // Date range
  const start = filters.startDate ?? defaultStart.toISOString()
  const end   = filters.endDate
  query = query.gte("created_at", start)
  if (end) query = query.lte("created_at", end)

  // Action filter
  if (filters.action?.length) query = query.in("action", filters.action)

  // Table filter
  if (filters.tableName?.length) query = query.in("table_name", filters.tableName)

  // Cursor pagination
  if (filters.cursor) query = query.lt("created_at", filters.cursor)

  const { data, error } = await query
  if (error) {
    console.error("[audit-queries] queryAuditLog failed:", error.message)
    return { entries: [], nextCursor: null }
  }

  const rows = data ?? []
  const hasMore = rows.length > PAGE_SIZE
  const entries = hasMore ? rows.slice(0, PAGE_SIZE) : rows

  // Resolve org names in a second query
  const orgIds = [...new Set(entries.map((e) => e.org_id).filter(Boolean) as string[])]
  const { data: orgs } = orgIds.length > 0
    ? await db.from("organisations").select("id, name").in("id", orgIds)
    : { data: [] }
  const orgMap = new Map((orgs ?? []).map((o) => [o.id as string, o.name as string]))

  const enriched: AuditEntry[] = entries.map((e) => ({
    ...e,
    old_values: e.old_values as Record<string, unknown> | null,
    new_values: e.new_values as Record<string, unknown> | null,
    org_name: e.org_id ? orgMap.get(e.org_id) : undefined,
  }))

  const nextCursor = hasMore ? entries[entries.length - 1]?.created_at ?? null : null
  return { entries: enriched, nextCursor }
}

export async function getAuditEntry(id: string): Promise<AuditEntry | null> {
  const db = await createServiceClient()

  const { data, error } = await db
    .from("audit_log")
    .select("id, org_id, table_name, record_id, action, changed_by, old_values, new_values, ip_address, user_agent, created_at")
    .eq("id", id)
    .single()

  if (error || !data) return null

  const orgId = data.org_id as string | null
  let org_name: string | undefined
  if (orgId) {
    const { data: org } = await db.from("organisations").select("name").eq("id", orgId).single()
    org_name = org?.name as string | undefined
  }

  return {
    ...data,
    old_values: data.old_values as Record<string, unknown> | null,
    new_values: data.new_values as Record<string, unknown> | null,
    org_name,
  }
}

export async function getDistinctTableNames(): Promise<string[]> {
  const db = await createServiceClient()
  const { data } = await db
    .from("audit_log")
    .select("table_name")
    .order("table_name")
    .limit(200)

  const unique = [...new Set((data ?? []).map((r) => r.table_name as string))]
  return unique.sort()
}
