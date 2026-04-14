import { createServiceClient } from "@/lib/supabase/server"
import { toDateStr } from "./periods"
import type { InspectionScheduleData, InspectionScheduleRow, ReportFilters } from "./types"

type ContactRow = { first_name: string | null; last_name: string | null; company_name: string | null; entity_type: string }

function tenantName(c: ContactRow | null): string | null {
  if (!c) return null
  if (c.entity_type === "company") return c.company_name ?? null
  return `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim() || null
}

export async function buildInspectionSchedule(filters: ReportFilters): Promise<InspectionScheduleData> {
  const db = await createServiceClient()
  const { orgId, propertyIds } = filters

  const now = new Date()
  const cutoff = new Date(now)
  cutoff.setDate(cutoff.getDate() + 90)

  let query = db
    .from("inspections")
    .select("id, inspection_type, status, scheduled_date, property_id, unit_id, tenant_id, units(unit_number, properties(name))")
    .eq("org_id", orgId)
    .in("status", ["scheduled", "in_progress"])
    .lte("scheduled_date", toDateStr(cutoff))
    .order("scheduled_date", { ascending: true })
  if (propertyIds?.length) query = query.in("property_id", propertyIds)

  const { data, error } = await query
  if (error) console.error("inspectionSchedule:", error.message)

  const inspections = data ?? []

  // Resolve tenant names in bulk
  const tenantIds = [...new Set(inspections.map((i) => i.tenant_id as string | null).filter(Boolean))] as string[]
  const tenantNameMap = new Map<string, string>()

  if (tenantIds.length > 0) {
    const { data: tenants, error: tErr } = await db
      .from("tenants")
      .select("id, contacts(first_name, last_name, company_name, entity_type)")
      .in("id", tenantIds)
    if (tErr) console.error("inspectionSchedule tenants:", tErr.message)
    for (const t of (tenants ?? []) as unknown as Array<{ id: string; contacts: ContactRow | null }>) {
      const name = tenantName(t.contacts)
      if (name) tenantNameMap.set(t.id, name)
    }
  }

  const rows: InspectionScheduleRow[] = inspections.map((i) => {
    const unitRaw = i.units as unknown as { unit_number: string; properties: { name: string } | null } | null
    const scheduledDate = new Date(i.scheduled_date as string)
    const daysOverdue = scheduledDate < now
      ? Math.floor((now.getTime() - scheduledDate.getTime()) / 86_400_000)
      : 0
    return {
      unit_number: unitRaw?.unit_number ?? "—",
      property_name: unitRaw?.properties?.name ?? "—",
      tenant_name: (i.tenant_id ? tenantNameMap.get(i.tenant_id as string) ?? null : null),
      type: i.inspection_type as string,
      scheduled_date: (i.scheduled_date as string)?.slice(0, 10) ?? "",
      status: i.status as string,
      days_overdue: daysOverdue,
    }
  })

  return {
    as_at: now,
    rows,
    upcoming_count: rows.filter((r) => r.days_overdue === 0).length,
    overdue_count: rows.filter((r) => r.days_overdue > 0).length,
  }
}
