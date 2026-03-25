import { createServiceClient } from "@/lib/supabase/server"
import type { MaintenanceCostData, MaintenanceCostRow, ReportFilters } from "./types"

export async function buildMaintenanceCostReport(filters: ReportFilters): Promise<MaintenanceCostData> {
  const supabase = await createServiceClient()
  const { orgId, from, to, propertyIds } = filters

  const fromStr = from.toISOString()
  const toStr = to.toISOString()

  let query = supabase
    .from("maintenance_requests")
    .select(`
      id, work_order_number, property_id, unit_id, category, urgency,
      status, actual_cost_cents, completed_at, created_at,
      contractors(name, company_name),
      units(unit_number),
      properties(name)
    `)
    .eq("org_id", orgId)

  if (propertyIds?.length) query = query.in("property_id", propertyIds)

  const { data: allJobs } = await query
  const jobs = allJobs ?? []

  // Completed jobs in period (for cost analysis)
  const completedInPeriod = jobs.filter(
    (j) => j.completed_at && j.completed_at >= fromStr && j.completed_at <= toStr
  )

  const rows: MaintenanceCostRow[] = completedInPeriod.map((j) => {
    const unit = j.units as unknown as { unit_number: string } | null
    const prop = j.properties as unknown as { name: string } | null
    const contractor = j.contractors as unknown as { name: string; company_name: string } | null
    return {
      work_order_number: j.work_order_number ?? "",
      property_name: prop?.name ?? "",
      unit_number: unit?.unit_number ?? "",
      category: j.category ?? "other",
      contractor_name: contractor?.company_name ?? contractor?.name ?? "",
      completed_at: j.completed_at ? new Date(j.completed_at) : null,
      actual_cost_cents: j.actual_cost_cents ?? 0,
    }
  })

  const totalSpend = rows.reduce((s, r) => s + r.actual_cost_cents, 0)

  // By category
  const categoryMap = new Map<string, { jobs: number; spend: number }>()
  for (const r of rows) {
    const existing = categoryMap.get(r.category) ?? { jobs: 0, spend: 0 }
    existing.jobs++
    existing.spend += r.actual_cost_cents
    categoryMap.set(r.category, existing)
  }
  const byCategory = Array.from(categoryMap.entries())
    .map(([category, data]) => ({
      category,
      jobs: data.jobs,
      spend_cents: data.spend,
      percent: totalSpend > 0 ? Math.round((data.spend / totalSpend) * 100) : 0,
    }))
    .sort((a, b) => b.spend_cents - a.spend_cents)

  // By property — need unit counts per property
  const { data: unitCounts } = await supabase
    .from("units")
    .select("property_id")
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .eq("is_archived", false)

  const unitsPerProp = new Map<string, number>()
  for (const u of unitCounts ?? []) {
    unitsPerProp.set(u.property_id, (unitsPerProp.get(u.property_id) ?? 0) + 1)
  }

  const propMap = new Map<string, { name: string; jobs: number; spend: number }>()
  for (const r of rows) {
    const existing = propMap.get(r.property_name) ?? { name: r.property_name, jobs: 0, spend: 0 }
    existing.jobs++
    existing.spend += r.actual_cost_cents
    propMap.set(r.property_name, existing)
  }

  const byProperty = Array.from(propMap.entries()).map(([, data]) => {
    // Find property_id by matching name in rows
    const matchJob = completedInPeriod.find((j) => {
      const prop = j.properties as unknown as { name: string } | null
      return prop?.name === data.name
    })
    const propId = matchJob?.property_id ?? ""
    const totalUnits = unitsPerProp.get(propId) ?? 1
    return {
      property_name: data.name,
      jobs: data.jobs,
      spend_cents: data.spend,
      per_unit_cents: Math.round(data.spend / totalUnits),
      total_units: totalUnits,
    }
  }).sort((a, b) => b.spend_cents - a.spend_cents)

  // SLA performance (all jobs in period, not just completed)
  const periodJobs = jobs.filter(
    (j) => j.created_at >= fromStr && j.created_at <= toStr
  )
  const emergency = periodJobs.filter((j) => j.urgency === "emergency")
  const urgent = periodJobs.filter((j) => j.urgency === "urgent")
  const routine = periodJobs.filter((j) => j.urgency === "routine" || !j.urgency)

  function slaMetCount(jobList: typeof jobs, slaHours: number): number {
    return jobList.filter((j) => {
      if (!j.completed_at) return false
      const created = new Date(j.created_at).getTime()
      const completed = new Date(j.completed_at).getTime()
      return (completed - created) <= slaHours * 3600000
    }).length
  }

  return {
    period: { from, to },
    jobs: rows,
    by_category: byCategory,
    by_property: byProperty,
    total_spend_cents: totalSpend,
    total_jobs: rows.length,
    sla_performance: {
      emergency: { total: emergency.length, met: slaMetCount(emergency, 4) },
      urgent: { total: urgent.length, met: slaMetCount(urgent, 24) },
      routine: { total: routine.length, met: slaMetCount(routine, 168) },
    },
  }
}
