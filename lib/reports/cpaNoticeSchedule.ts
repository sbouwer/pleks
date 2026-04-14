import { createServiceClient } from "@/lib/supabase/server"
import { toDateStr } from "./periods"
import type { CpaNoticeScheduleData, CpaNoticeRow, ReportFilters } from "./types"

// CPA s14 notice must be given 20 business days before lease end (approx 28 calendar days)
const NOTICE_DAYS = 90

export async function buildCpaNoticeSchedule(filters: ReportFilters): Promise<CpaNoticeScheduleData> {
  const db = await createServiceClient()
  const { orgId, propertyIds } = filters

  const now = new Date()
  const cutoff = new Date(now)
  cutoff.setDate(cutoff.getDate() + NOTICE_DAYS)

  const query = db
    .from("leases")
    .select("id, end_date, tenant_id, unit_id, status, cpa_notice_sent_at, tenants(contacts(first_name, last_name, company_name, entity_type)), units(unit_number, property_id, properties(name))")
    .eq("org_id", orgId)
    .in("status", ["active", "notice"])
    .not("end_date", "is", null)
    .lte("end_date", toDateStr(cutoff))
    .order("end_date", { ascending: true })

  const { data, error } = await query
  if (error) console.error("cpaNoticeSchedule:", error.message)

  const rows: CpaNoticeRow[] = (data ?? [])
    .filter((l) => {
      if (!propertyIds?.length) return true
      const unitRaw = l.units as unknown as { property_id: string } | null
      return propertyIds.includes(unitRaw?.property_id ?? "")
    })
    .map((l) => {
      const tRaw = l.tenants as unknown as { contacts: { first_name: string | null; last_name: string | null; company_name: string | null; entity_type: string } | null } | null
      const c = tRaw?.contacts
      const tenantName = c?.entity_type === "company"
        ? (c.company_name ?? "Tenant")
        : `${c?.first_name ?? ""} ${c?.last_name ?? ""}`.trim() || "Tenant"
      const unitRaw = l.units as unknown as { unit_number: string; properties: { name: string } | null } | null
      const leaseEnd = new Date(l.end_date as string)
      const daysRemaining = Math.floor((leaseEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      const noticeDueBy = new Date(leaseEnd)
      noticeDueBy.setDate(noticeDueBy.getDate() - 28)
      const noticeSent = l.cpa_notice_sent_at != null
      let status: string
      if (noticeSent) { status = "sent" }
      else if (noticeDueBy < now) { status = "overdue" }
      else { status = "pending" }

      return {
        lease_id: l.id as string,
        tenant_name: tenantName,
        unit_number: unitRaw?.unit_number ?? "—",
        property_name: unitRaw?.properties?.name ?? "—",
        lease_end: l.end_date as string,
        days_remaining: daysRemaining,
        notice_due_by: toDateStr(noticeDueBy),
        status,
      }
    })

  const nowStr = toDateStr(now)
  const weekStr = toDateStr(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 7))

  return {
    as_at: now,
    rows,
    overdue_count: rows.filter((r) => r.status === "overdue").length,
    due_this_week: rows.filter((r) => r.status === "pending" && r.notice_due_by >= nowStr && r.notice_due_by <= weekStr).length,
    due_30d: rows.filter((r) => r.status === "pending").length,
  }
}
