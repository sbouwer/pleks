import { createServiceClient } from "@/lib/supabase/server"
import type { OwnerPortfolioData, OwnerPortfolioRow, ReportFilters } from "./types"

export async function buildOwnerPortfolio(filters: ReportFilters): Promise<OwnerPortfolioData> {
  const supabase = await createServiceClient()
  const { orgId, from, to, propertyIds } = filters

  const fromStr = from.toISOString()
  const toStr = to.toISOString()

  // Get owner statements for period
  let stmtQuery = supabase
    .from("owner_statements")
    .select(`
      id, property_id, gross_income_cents, total_expenses_cents,
      management_fee_cents, management_fee_vat_cents,
      net_to_owner_cents, deposits_held_cents,
      properties(name, owner_id)
    `)
    .eq("org_id", orgId)
    .gte("period_from", fromStr)
    .lte("period_to", toStr)

  if (propertyIds?.length) stmtQuery = stmtQuery.in("property_id", propertyIds)
  const { data: statements } = await stmtQuery

  const stmts = statements ?? []

  // Get unit counts per property
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

  // Get owner names — use property owner reference
  // For now, use property name as owner identifier (owner_id links to a tenant/contact record)
  const ownerMap = new Map<string, OwnerPortfolioRow>()

  for (const s of stmts) {
    const prop = s.properties as unknown as { name: string; owner_id: string } | null
    const propName = prop?.name ?? "Unknown"
    const ownerId = prop?.owner_id ?? propName

    const existing = ownerMap.get(ownerId) ?? {
      owner_name: ownerId, // Will be resolved below
      property_name: propName,
      units: 0,
      gross_income_cents: 0,
      expenses_cents: 0,
      net_to_owner_cents: 0,
      deposits_held_cents: 0,
    }

    existing.property_name = propName
    existing.units = unitsPerProp.get(s.property_id) ?? 0
    existing.gross_income_cents += s.gross_income_cents ?? 0
    existing.expenses_cents += s.total_expenses_cents ?? 0
    existing.net_to_owner_cents += s.net_to_owner_cents ?? 0
    existing.deposits_held_cents += s.deposits_held_cents ?? 0

    ownerMap.set(ownerId, existing)
  }

  // Resolve owner names from tenants table (owners are stored as tenant records)
  const ownerIds = Array.from(ownerMap.keys()).filter((id) => id.length === 36) // UUID check
  if (ownerIds.length > 0) {
    const { data: owners } = await supabase
      .from("landlord_view")
      .select("id, first_name, last_name, company_name")
      .in("id", ownerIds)

    for (const owner of owners ?? []) {
      const row = ownerMap.get(owner.id)
      if (row) {
        row.owner_name = owner.company_name ?? `${owner.first_name} ${owner.last_name}`
      }
    }
  }

  const owners = Array.from(ownerMap.values()).sort((a, b) => b.net_to_owner_cents - a.net_to_owner_cents)

  const totalIncome = owners.reduce((s, o) => s + o.gross_income_cents, 0)
  const totalExpenses = owners.reduce((s, o) => s + o.expenses_cents, 0)
  const totalNet = owners.reduce((s, o) => s + o.net_to_owner_cents, 0)
  const totalDeposits = owners.reduce((s, o) => s + o.deposits_held_cents, 0)

  // Management fee income
  const { data: feeInvoices } = await supabase
    .from("management_fee_invoices")
    .select("total_cents")
    .eq("org_id", orgId)
    .gte("period_month", fromStr)
    .lte("period_month", toStr)

  const mgmtFeeIncome = (feeInvoices ?? []).reduce((s, f) => s + (f.total_cents ?? 0), 0)

  return {
    period: { from, to },
    owners,
    total_income_cents: totalIncome,
    total_expenses_cents: totalExpenses,
    total_net_cents: totalNet,
    total_deposits_cents: totalDeposits,
    management_fee_income_cents: mgmtFeeIncome,
  }
}
