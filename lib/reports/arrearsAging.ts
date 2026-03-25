import { createServiceClient } from "@/lib/supabase/server"
import type { ArrearsAgingData, ArrearsAgingRow, ReportFilters } from "./types"

export async function buildArrearsAgingReport(filters: ReportFilters): Promise<ArrearsAgingData> {
  const supabase = await createServiceClient()
  const { orgId, propertyIds } = filters

  let query = supabase
    .from("arrears_cases")
    .select(`
      id, tenant_id, unit_id, property_id, total_arrears_cents,
      oldest_outstanding_date, current_step, status,
      tenants(first_name, last_name),
      units(unit_number),
      properties(name)
    `)
    .eq("org_id", orgId)
    .in("status", ["open", "arrangement"])

  if (propertyIds?.length) query = query.in("property_id", propertyIds)

  const { data: cases } = await query
  const allCases = cases ?? []
  const now = Date.now()

  let total30 = 0, total60 = 0, total90 = 0, total90plus = 0

  const rows: ArrearsAgingRow[] = allCases.map((c) => {
    const tenant = c.tenants as unknown as { first_name: string; last_name: string } | null
    const unit = c.units as unknown as { unit_number: string } | null
    const prop = c.properties as unknown as { name: string } | null
    const amount = c.total_arrears_cents ?? 0

    const oldest = c.oldest_outstanding_date ? new Date(c.oldest_outstanding_date).getTime() : now
    const daysBehind = Math.floor((now - oldest) / (1000 * 60 * 60 * 24))

    let a30 = 0, a60 = 0, a90 = 0, a90p = 0
    // Simplified aging: assign total to the oldest bucket
    if (daysBehind <= 30) { a30 = amount; total30 += amount }
    else if (daysBehind <= 60) { a60 = amount; total60 += amount }
    else if (daysBehind <= 90) { a90 = amount; total90 += amount }
    else { a90p = amount; total90plus += amount }

    return {
      tenant_id: c.tenant_id,
      tenant_name: tenant ? `${tenant.first_name} ${tenant.last_name}` : "Unknown",
      unit_number: unit?.unit_number ?? "",
      property_name: prop?.name ?? "",
      arrears_30d_cents: a30,
      arrears_60d_cents: a60,
      arrears_90d_cents: a90,
      arrears_90plus_cents: a90p,
      total_cents: amount,
      current_step: c.current_step ?? 0,
      status: c.status,
    }
  })

  return {
    as_at: new Date(),
    cases: rows.sort((a, b) => b.total_cents - a.total_cents),
    total_30d_cents: total30,
    total_60d_cents: total60,
    total_90d_cents: total90,
    total_90plus_cents: total90plus,
    total_arrears_cents: total30 + total60 + total90 + total90plus,
    tenants_in_arrears: rows.length,
  }
}
