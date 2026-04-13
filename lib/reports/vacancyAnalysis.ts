import { createServiceClient } from "@/lib/supabase/server"
import type { VacancyAnalysisData, VacancyRow, ReportFilters } from "./types"

export async function buildVacancyAnalysis(filters: ReportFilters): Promise<VacancyAnalysisData> {
  const db = await createServiceClient()
  const { orgId, propertyIds } = filters

  let unitsQuery = db
    .from("units")
    .select("id, unit_number, property_id, status, monthly_rent_cents, vacant_since, properties(name)")
    .eq("org_id", orgId)
    .eq("status", "vacant")
    .is("deleted_at", null)
    .eq("is_archived", false)
  if (propertyIds?.length) unitsQuery = unitsQuery.in("property_id", propertyIds)

  const { data, error } = await unitsQuery
  if (error) console.error("vacancyAnalysis:", error.message)

  const now = new Date()
  const rows: VacancyRow[] = (data ?? []).map((u) => {
    const propRaw = u.properties as unknown as { name: string } | null
    const vacantSince = u.vacant_since ? new Date(u.vacant_since as string) : now
    const daysVacant = Math.floor((now.getTime() - vacantSince.getTime()) / (1000 * 60 * 60 * 24))
    const rentCents = u.monthly_rent_cents as number ?? 0
    const lostCents = Math.round(rentCents * (daysVacant / 30))
    return {
      unit_id: u.id as string,
      unit_number: u.unit_number as string,
      property_name: propRaw?.name ?? "Unknown",
      days_vacant: daysVacant,
      monthly_rent_cents: rentCents,
      estimated_lost_cents: lostCents,
    }
  })

  rows.sort((a, b) => b.days_vacant - a.days_vacant)

  const avgDays = rows.length > 0 ? Math.round(rows.reduce((s, r) => s + r.days_vacant, 0) / rows.length) : 0

  return {
    as_at: now,
    currently_vacant: rows,
    total_vacant: rows.length,
    total_estimated_lost_cents: rows.reduce((s, r) => s + r.estimated_lost_cents, 0),
    average_days_vacant: avgDays,
  }
}
