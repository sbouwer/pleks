import { createServiceClient } from "@/lib/supabase/server"
import type { PropertyPerformanceData, PropertyPerformanceRow, ReportFilters } from "./types"

export async function buildPropertyPerformance(filters: ReportFilters): Promise<PropertyPerformanceData> {
  const db = await createServiceClient()
  const { orgId, from, to, propertyIds } = filters

  const fromStr = from.toISOString().slice(0, 10)
  const toStr = to.toISOString().slice(0, 10)

  let propQuery = db
    .from("properties")
    .select("id, name")
    .eq("org_id", orgId)
    .is("deleted_at", null)
  if (propertyIds?.length) propQuery = propQuery.in("id", propertyIds)
  const { data: properties, error: propErr } = await propQuery
  if (propErr) console.error("propertyPerformance props:", propErr.message)

  const propIds = (properties ?? []).map((p) => p.id)
  if (propIds.length === 0) {
    return { period: { from, to }, rows: [], total_gross_cents: 0, total_expenses_cents: 0, total_net_cents: 0 }
  }

  const [stmtsRes, unitsRes, maintRes] = await Promise.all([
    db.from("owner_statements")
      .select("property_id, gross_income_cents, total_expenses_cents, management_fee_cents, management_fee_vat_cents, net_to_owner_cents")
      .eq("org_id", orgId)
      .in("property_id", propIds)
      .gte("period_from", fromStr)
      .lte("period_to", toStr),
    db.from("units")
      .select("id, property_id, status")
      .eq("org_id", orgId)
      .in("property_id", propIds)
      .is("deleted_at", null)
      .eq("is_archived", false),
    db.from("maintenance_requests")
      .select("property_id, actual_cost_cents")
      .eq("org_id", orgId)
      .in("property_id", propIds)
      .eq("status", "completed")
      .gte("completed_at", fromStr)
      .lte("completed_at", toStr),
  ])

  if (stmtsRes.error) console.error("propertyPerformance stmts:", stmtsRes.error.message)

  const stmtsByProp = new Map<string, { gross: number; expenses: number; fees: number; net: number }>()
  for (const s of stmtsRes.data ?? []) {
    const pid = s.property_id as string
    const existing = stmtsByProp.get(pid) ?? { gross: 0, expenses: 0, fees: 0, net: 0 }
    stmtsByProp.set(pid, {
      gross: existing.gross + (s.gross_income_cents ?? 0),
      expenses: existing.expenses + (s.total_expenses_cents ?? 0),
      fees: existing.fees + (s.management_fee_cents ?? 0) + (s.management_fee_vat_cents ?? 0),
      net: existing.net + (s.net_to_owner_cents ?? 0),
    })
  }

  const units = unitsRes.data ?? []
  const maint = maintRes.data ?? []

  const rows: PropertyPerformanceRow[] = (properties ?? []).map((p) => {
    const s = stmtsByProp.get(p.id) ?? { gross: 0, expenses: 0, fees: 0, net: 0 }
    const pUnits = units.filter((u) => u.property_id === p.id)
    const occupied = pUnits.filter((u) => u.status === "occupied").length
    const maintSpend = maint.filter((m) => m.property_id === p.id).reduce((sum, m) => sum + (m.actual_cost_cents ?? 0), 0)
    const totalExpenses = s.expenses + s.fees

    return {
      property_id: p.id,
      property_name: p.name,
      units: pUnits.length,
      occupied_units: occupied,
      gross_income_cents: s.gross,
      total_expenses_cents: totalExpenses,
      net_income_cents: s.net,
      maintenance_spend_cents: maintSpend,
      occupancy_rate: pUnits.length > 0 ? Math.round((occupied / pUnits.length) * 100) : 0,
    }
  })

  return {
    period: { from, to },
    rows,
    total_gross_cents: rows.reduce((s, r) => s + r.gross_income_cents, 0),
    total_expenses_cents: rows.reduce((s, r) => s + r.total_expenses_cents, 0),
    total_net_cents: rows.reduce((s, r) => s + r.net_income_cents, 0),
  }
}
