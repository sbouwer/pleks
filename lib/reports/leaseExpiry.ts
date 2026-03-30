import { createServiceClient } from "@/lib/supabase/server"
import type { LeaseExpiryData, LeaseExpiryRow, ReportFilters } from "./types"

export async function buildLeaseExpiryReport(filters: ReportFilters): Promise<LeaseExpiryData> {
  const supabase = await createServiceClient()
  const { orgId, propertyIds } = filters

  let query = supabase
    .from("leases")
    .select(`
      id, unit_id, property_id, tenant_id, start_date, end_date,
      is_fixed_term, rent_amount_cents, status,
      auto_renewal_notice_sent_at,
      units(unit_number),
      properties(name),
      tenant_view(first_name, last_name)
    `)
    .eq("org_id", orgId)
    .in("status", ["active"])

  if (propertyIds?.length) query = query.in("property_id", propertyIds)

  const { data: leases } = await query
  const allLeases = leases ?? []

  const now = new Date()
  const d30 = new Date(now); d30.setDate(d30.getDate() + 30)
  const d60 = new Date(now); d60.setDate(d60.getDate() + 60)
  const d90 = new Date(now); d90.setDate(d90.getDate() + 90)

  function toRow(l: typeof allLeases[number]): LeaseExpiryRow {
    const unit = l.units as unknown as { unit_number: string } | null
    const prop = l.properties as unknown as { name: string } | null
    const tenant = l.tenant_view as unknown as { first_name: string; last_name: string } | null
    const endDate = l.end_date ? new Date(l.end_date) : null
    const daysToExpiry = endDate
      ? Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      : null

    let renewalStatus = "no_action"
    if (l.auto_renewal_notice_sent_at) renewalStatus = "notice_sent"

    return {
      lease_id: l.id,
      unit_number: unit?.unit_number ?? "",
      property_name: prop?.name ?? "",
      tenant_name: tenant ? `${tenant.first_name} ${tenant.last_name}` : "",
      lease_end: endDate,
      rent_amount_cents: l.rent_amount_cents ?? 0,
      is_fixed_term: l.is_fixed_term ?? true,
      days_to_expiry: daysToExpiry,
      status: l.status,
      renewal_status: renewalStatus,
    }
  }

  const fixedLeases = allLeases.filter((l) => l.end_date)
  const mtmLeases = allLeases.filter((l) => !l.end_date || !l.is_fixed_term)

  const exp30 = fixedLeases
    .filter((l) => { const e = new Date(l.end_date!); return e >= now && e <= d30 })
    .map(toRow)
    .sort((a, b) => (a.days_to_expiry ?? 0) - (b.days_to_expiry ?? 0))

  const exp60 = fixedLeases
    .filter((l) => { const e = new Date(l.end_date!); return e > d30 && e <= d60 })
    .map(toRow)
    .sort((a, b) => (a.days_to_expiry ?? 0) - (b.days_to_expiry ?? 0))

  const exp90 = fixedLeases
    .filter((l) => { const e = new Date(l.end_date!); return e > d60 && e <= d90 })
    .map(toRow)
    .sort((a, b) => (a.days_to_expiry ?? 0) - (b.days_to_expiry ?? 0))

  const monthToMonth = mtmLeases.map(toRow)

  const allExpiring = [...exp30, ...exp60, ...exp90]
  const actionRequired = allExpiring.filter((l) => l.renewal_status === "no_action").length

  return {
    as_at: now,
    expiring_30d: exp30,
    expiring_60d: exp60,
    expiring_90d: exp90,
    month_to_month: monthToMonth,
    action_required: actionRequired,
  }
}
