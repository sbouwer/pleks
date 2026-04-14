import { createServiceClient } from "@/lib/supabase/server"
import type { MunicipalCostsData, MunicipalCostRow, ReportFilters } from "./types"

export async function buildMunicipalCosts(filters: ReportFilters): Promise<MunicipalCostsData> {
  const db = await createServiceClient()
  const { orgId, from, to, propertyIds } = filters

  const fromStr = from.toISOString().slice(0, 10)
  const toStr = to.toISOString().slice(0, 10)

  let query = db
    .from("municipal_bills")
    .select("property_id, billing_period_from, billing_period_to, charge_water_cents, charge_electricity_cents, charge_rates_cents, charge_refuse_cents, total_current_charges_cents, properties(name)")
    .eq("org_id", orgId)
    .gte("billing_period_from", fromStr)
    .lte("billing_period_to", toStr)
    .order("billing_period_from", { ascending: true })
  if (propertyIds?.length) query = query.in("property_id", propertyIds)

  const { data, error } = await query
  if (error) console.error("municipalCosts:", error.message)

  const rows: MunicipalCostRow[] = (data ?? []).map((b) => {
    const propRaw = b.properties as unknown as { name: string } | null
    const period = (b.billing_period_from as string)?.slice(0, 7) ?? ""
    return {
      property_name: propRaw?.name ?? "Unknown",
      period,
      water_cents: b.charge_water_cents as number ?? 0,
      electricity_cents: b.charge_electricity_cents as number ?? 0,
      rates_cents: b.charge_rates_cents as number ?? 0,
      refuse_cents: b.charge_refuse_cents as number ?? 0,
      total_cents: b.total_current_charges_cents as number ?? 0,
    }
  })

  return {
    period: { from, to },
    rows,
    total_water_cents: rows.reduce((s, r) => s + r.water_cents, 0),
    total_electricity_cents: rows.reduce((s, r) => s + r.electricity_cents, 0),
    total_rates_cents: rows.reduce((s, r) => s + r.rates_cents, 0),
    total_refuse_cents: rows.reduce((s, r) => s + r.refuse_cents, 0),
    total_amount_cents: rows.reduce((s, r) => s + r.total_cents, 0),
  }
}
