import { createServiceClient } from "@/lib/supabase/server"
import type { OccupancyData, OccupancyRow, ReportFilters, VacancyDetail } from "./types"

export async function buildOccupancyReport(filters: ReportFilters): Promise<OccupancyData> {
  const supabase = await createServiceClient()
  const { orgId, from, to, propertyIds } = filters

  let propQuery = supabase
    .from("properties")
    .select("id, name")
    .eq("org_id", orgId)
    .is("deleted_at", null)
  if (propertyIds?.length) propQuery = propQuery.in("id", propertyIds)
  const { data: properties } = await propQuery

  const propIds = properties?.map((p) => p.id) ?? []
  const propMap = new Map(properties?.map((p) => [p.id, p.name]) ?? [])

  const { data: units } = await supabase
    .from("units")
    .select("id, property_id, unit_number, status")
    .eq("org_id", orgId)
    .in("property_id", propIds)
    .is("deleted_at", null)
    .eq("is_archived", false)

  const allUnits = units ?? []

  // Per-property rows
  const rows: OccupancyRow[] = propIds.map((pid) => {
    const pUnits = allUnits.filter((u) => u.property_id === pid)
    const occupied = pUnits.filter((u) => u.status === "occupied").length
    const vacant = pUnits.filter((u) => u.status === "vacant").length
    const notice = pUnits.filter((u) => u.status === "notice").length
    return {
      property_id: pid,
      property_name: propMap.get(pid) ?? "Unknown",
      total_units: pUnits.length,
      occupied_units: occupied,
      vacant_units: vacant,
      notice_units: notice,
      occupancy_rate: pUnits.length > 0 ? Math.round((occupied / pUnits.length) * 100) : 0,
    }
  })

  const totalUnits = allUnits.length
  const totalOccupied = allUnits.filter((u) => u.status === "occupied").length
  const totalVacant = allUnits.filter((u) => u.status === "vacant").length
  const totalNotice = allUnits.filter((u) => u.status === "notice").length

  const totals: OccupancyRow = {
    property_id: "total",
    property_name: "TOTAL",
    total_units: totalUnits,
    occupied_units: totalOccupied,
    vacant_units: totalVacant,
    notice_units: totalNotice,
    occupancy_rate: totalUnits > 0 ? Math.round((totalOccupied / totalUnits) * 100) : 0,
  }

  // Vacancy details — get status history for vacant units
  const vacantUnits = allUnits.filter((u) => u.status === "vacant")
  const vacancies: VacancyDetail[] = []
  const now = new Date()

  for (const unit of vacantUnits) {
    const { data: history } = await supabase
      .from("unit_status_history")
      .select("created_at")
      .eq("unit_id", unit.id)
      .eq("to_status", "vacant")
      .order("created_at", { ascending: false })
      .limit(1)

    const vacantSince = history?.[0]?.created_at ? new Date(history[0].created_at) : new Date()
    const daysVacant = Math.floor((now.getTime() - vacantSince.getTime()) / (1000 * 60 * 60 * 24))

    vacancies.push({
      unit_id: unit.id,
      unit_number: unit.unit_number,
      property_name: propMap.get(unit.property_id) ?? "Unknown",
      vacant_since: vacantSince,
      days_vacant: daysVacant,
    })
  }

  const avgVacancy = vacancies.length > 0
    ? Math.round(vacancies.reduce((s, v) => s + v.days_vacant, 0) / vacancies.length)
    : 0

  return {
    period: { from, to },
    rows,
    totals,
    vacancies: vacancies.sort((a, b) => b.days_vacant - a.days_vacant),
    average_vacancy_days: avgVacancy,
  }
}
