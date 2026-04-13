import { createServiceClient } from "@/lib/supabase/server"
import type { InspectionScheduleData, InspectionScheduleRow, ReportFilters } from "./types"

export async function buildInspectionSchedule(filters: ReportFilters): Promise<InspectionScheduleData> {
  const db = await createServiceClient()
  const { orgId, propertyIds } = filters

  const now = new Date()
  const cutoff = new Date(now)
  cutoff.setDate(cutoff.getDate() + 90)

  let query = db
    .from("inspections")
    .select("id, type, status, scheduled_date, property_id, unit_id, units(unit_number, properties(name))")
    .eq("org_id", orgId)
    .in("status", ["scheduled", "pending", "overdue"])
    .lte("scheduled_date", cutoff.toISOString().slice(0, 10))
    .order("scheduled_date", { ascending: true })
  if (propertyIds?.length) query = query.in("property_id", propertyIds)

  const { data, error } = await query
  if (error) console.error("inspectionSchedule:", error.message)

  const rows: InspectionScheduleRow[] = (data ?? []).map((i) => {
    const unitRaw = i.units as unknown as { unit_number: string; properties: { name: string } | null } | null
    const scheduledDate = new Date(i.scheduled_date as string)
    const daysOverdue = scheduledDate < now
      ? Math.floor((now.getTime() - scheduledDate.getTime()) / (1000 * 60 * 60 * 24))
      : 0
    return {
      unit_number: unitRaw?.unit_number ?? "—",
      property_name: unitRaw?.properties?.name ?? "—",
      type: i.type as string,
      scheduled_date: i.scheduled_date as string,
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
