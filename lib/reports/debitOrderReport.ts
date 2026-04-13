import { createServiceClient } from "@/lib/supabase/server"
import type { DebitOrderReportData, DebitOrderRow, ReportFilters } from "./types"

export async function buildDebitOrderReport(filters: ReportFilters): Promise<DebitOrderReportData> {
  const db = await createServiceClient()
  const { orgId } = filters

  const { data, error } = await db
    .from("debicheck_mandates")
    .select("id, tenant_id, lease_id, amount_cents, status, last_collection_date, next_collection_date, tenants(first_name, last_name, company_name, entity_type), leases(units(unit_number, properties(name)))")
    .eq("org_id", orgId)
    .order("status", { ascending: true })

  if (error) console.error("debitOrderReport:", error.message)

  const rows: DebitOrderRow[] = (data ?? []).map((m) => {
    const tenantRaw = m.tenants as unknown as { first_name: string | null; last_name: string | null; company_name: string | null; entity_type: string } | null
    const tenantName = tenantRaw?.entity_type === "company"
      ? (tenantRaw.company_name ?? "Tenant")
      : `${tenantRaw?.first_name ?? ""} ${tenantRaw?.last_name ?? ""}`.trim() || "Tenant"
    const leaseRaw = m.leases as unknown as { units: { unit_number: string; properties: { name: string } | null } | null } | null
    return {
      tenant_name: tenantName,
      unit_number: leaseRaw?.units?.unit_number ?? "—",
      property_name: leaseRaw?.units?.properties?.name ?? "—",
      amount_cents: m.amount_cents as number ?? 0,
      status: m.status as string,
      last_collection_date: (m.last_collection_date as string | null) ?? null,
      next_collection_date: (m.next_collection_date as string | null) ?? null,
    }
  })

  const active = rows.filter((r) => r.status === "active" || r.status === "authorised")

  return {
    as_at: new Date(),
    rows,
    total_mandates: rows.length,
    active_mandates: active.length,
    total_amount_cents: active.reduce((s, r) => s + r.amount_cents, 0),
  }
}
