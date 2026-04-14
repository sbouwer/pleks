import { createServiceClient } from "@/lib/supabase/server"
import type { VacancyAnalysisData, VacancyRow, ReportFilters } from "./types"

export async function buildVacancyAnalysis(filters: ReportFilters): Promise<VacancyAnalysisData> {
  const db = await createServiceClient()
  const { orgId, propertyIds } = filters

  let unitsQuery = db
    .from("units")
    .select("id, unit_number, property_id, status, market_rent_cents, properties(name)")
    .eq("org_id", orgId)
    .eq("status", "vacant")
    .is("deleted_at", null)
    .eq("is_archived", false)
  if (propertyIds?.length) unitsQuery = unitsQuery.in("property_id", propertyIds)

  const { data: unitsData, error: unitsError } = await unitsQuery
  if (unitsError) console.error("vacancyAnalysis units:", unitsError.message)

  const units = unitsData ?? []
  if (units.length === 0) {
    const now = new Date()
    return { as_at: now, currently_vacant: [], total_vacant: 0, total_estimated_lost_cents: 0, average_days_vacant: 0 }
  }

  const unitIds = units.map((u) => u.id as string)

  // Use last ended lease's end_date as vacancy start — more reliable than updated_at
  const { data: leasesData, error: leasesError } = await db
    .from("leases")
    .select("unit_id, end_date")
    .eq("org_id", orgId)
    .in("unit_id", unitIds)
    .in("status", ["ended", "terminated"])
    .order("end_date", { ascending: false })

  if (leasesError) console.error("vacancyAnalysis leases:", leasesError.message)

  // Last ended lease per unit
  const lastLeaseEnd = new Map<string, string>()
  for (const l of leasesData ?? []) {
    const uid = l.unit_id as string
    if (!lastLeaseEnd.has(uid)) lastLeaseEnd.set(uid, l.end_date as string)
  }

  const now = new Date()
  const rows: VacancyRow[] = units.map((u) => {
    const propRaw = u.properties as unknown as { name: string } | null
    const vacantSinceStr = lastLeaseEnd.get(u.id as string) ?? null
    const vacantSince = vacantSinceStr ? new Date(vacantSinceStr) : null
    const daysVacant = vacantSince ? Math.max(0, Math.floor((now.getTime() - vacantSince.getTime()) / (1000 * 60 * 60 * 24))) : 0
    const rentCents = (u.market_rent_cents as number) ?? 0
    const lostCents = Math.round(rentCents * (daysVacant / 30))
    return {
      unit_id: u.id as string,
      unit_number: u.unit_number as string,
      property_name: propRaw?.name ?? "Unknown",
      vacant_since: vacantSinceStr,
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
