import { toDateStr } from "./periods"
import { createServiceClient } from "@/lib/supabase/server"
import type { MaintenanceSlaData, MaintenanceSlaRow, ReportFilters } from "./types"

const SLA_HOURS: Record<string, number> = {
  emergency: 4,
  urgent: 24,
  routine: 72,
}

export async function buildMaintenanceSla(filters: ReportFilters): Promise<MaintenanceSlaData> {
  const db = await createServiceClient()
  const { orgId, from, to, propertyIds } = filters

  const fromStr = toDateStr(from)
  const toStr = toDateStr(to)

  let query = db
    .from("maintenance_requests")
    .select("id, work_order_number, urgency, category, status, created_at, completed_at, property_id, unit_id, properties(name)")
    .eq("org_id", orgId)
    .gte("created_at", fromStr)
    .lte("created_at", toStr)
  if (propertyIds?.length) query = query.in("property_id", propertyIds)

  const { data, error } = await query
  if (error) console.error("maintenanceSla:", error.message)

  const allRows: MaintenanceSlaRow[] = (data ?? []).map((job) => {
    const propRaw = job.properties as unknown as { name: string } | null
    const urgency = job.urgency as string ?? "routine"
    const slaHours = SLA_HOURS[urgency] ?? 72
    const created = new Date(job.created_at as string)
    const completed = job.completed_at ? new Date(job.completed_at as string) : null
    const actualHours = completed ? Math.round((completed.getTime() - created.getTime()) / (1000 * 60 * 60)) : null
    const metSla = actualHours != null ? actualHours <= slaHours : false

    return {
      work_order_number: job.work_order_number as string ?? job.id,
      property_name: propRaw?.name ?? "Unknown",
      category: job.category as string ?? "General",
      urgency,
      sla_target_hours: slaHours,
      actual_hours: actualHours,
      met_sla: metSla,
      created_at: (job.created_at as string).slice(0, 10),
    }
  })

  function calcSlaStats(urgency: string) {
    const subset = allRows.filter((r) => r.urgency === urgency && r.actual_hours != null)
    const met = subset.filter((r) => r.met_sla).length
    const rate = subset.length > 0 ? Math.round((met / subset.length) * 100) : 0
    return { total: subset.length, met, rate }
  }

  const emergency = calcSlaStats("emergency")
  const urgent = calcSlaStats("urgent")
  const routine = calcSlaStats("routine")

  const allMeasured = allRows.filter((r) => r.actual_hours != null)
  const overallMet = allMeasured.filter((r) => r.met_sla).length
  const overallRate = allMeasured.length > 0 ? Math.round((overallMet / allMeasured.length) * 100) : 0

  return {
    period: { from, to },
    emergency,
    urgent,
    routine,
    overall_compliance_rate: overallRate,
    breaches: allRows.filter((r) => r.actual_hours != null && !r.met_sla),
    all_rows: allRows,
  }
}
