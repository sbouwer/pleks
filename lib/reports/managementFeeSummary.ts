import { createServiceClient } from "@/lib/supabase/server"
import type { ManagementFeeSummaryData, ManagementFeeRow, ReportFilters } from "./types"

export async function buildManagementFeeSummary(filters: ReportFilters): Promise<ManagementFeeSummaryData> {
  const db = await createServiceClient()
  const { orgId, from, to, propertyIds } = filters

  let query = db
    .from("owner_statements")
    .select("id, property_id, period_from, period_to, period_month, management_fee_cents, management_fee_vat_cents, owner_payment_status, properties(name)")
    .eq("org_id", orgId)
    .gte("period_from", from.toISOString().slice(0, 10))
    .lte("period_to", to.toISOString().slice(0, 10))
    .order("period_from", { ascending: true })

  if (propertyIds?.length) query = query.in("property_id", propertyIds)

  const { data, error } = await query
  if (error) console.error("managementFeeSummary:", error.message)

  const rows: ManagementFeeRow[] = (data ?? []).map((s) => {
    const propRaw = s.properties as unknown as { name: string } | null
    const feeCents = s.management_fee_cents ?? 0
    const vatCents = s.management_fee_vat_cents ?? 0
    const period = s.period_from?.slice(0, 7) ?? s.period_month?.slice(0, 7) ?? ""
    const status = s.owner_payment_status === "paid" ? "released" : "pending"
    return {
      property_name: propRaw?.name ?? "Unknown",
      period,
      fee_cents: feeCents,
      vat_cents: vatCents,
      total_cents: feeCents + vatCents,
      status,
    }
  })

  const totalFees = rows.reduce((s, r) => s + r.fee_cents, 0)
  const totalVat = rows.reduce((s, r) => s + r.vat_cents, 0)

  return {
    period: { from, to },
    rows,
    total_fees_cents: totalFees,
    total_vat_cents: totalVat,
    total_gross_cents: totalFees + totalVat,
  }
}
