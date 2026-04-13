import { createServiceClient } from "@/lib/supabase/server"
import type { TenantDirectoryData, TenantDirectoryRow, ReportFilters } from "./types"

export async function buildTenantDirectory(filters: ReportFilters): Promise<TenantDirectoryData> {
  const db = await createServiceClient()
  const { orgId, propertyIds } = filters

  const query = db
    .from("leases")
    .select("id, end_date, monthly_rent_cents, tenant_id, unit_id, tenants(contact_id, contacts(first_name, last_name, company_name, entity_type, email, phone)), units(unit_number, property_id, properties(name))")
    .eq("org_id", orgId)
    .in("status", ["active", "notice", "month_to_month"])
    .order("end_date", { ascending: true })

  const { data, error } = await query
  if (error) console.error("tenantDirectory:", error.message)

  const rows: TenantDirectoryRow[] = (data ?? [])
    .filter((l) => {
      if (!propertyIds?.length) return true
      const unitRaw = l.units as unknown as { property_id: string } | null
      return propertyIds.includes(unitRaw?.property_id ?? "")
    })
    .map((l) => {
      const tRaw = l.tenants as unknown as { contacts: { first_name: string | null; last_name: string | null; company_name: string | null; entity_type: string; email: string | null; phone: string | null } | null } | null
      const c = tRaw?.contacts
      const tenantName = c?.entity_type === "company"
        ? (c.company_name ?? "Tenant")
        : `${c?.first_name ?? ""} ${c?.last_name ?? ""}`.trim() || "Tenant"
      const unitRaw = l.units as unknown as { unit_number: string; properties: { name: string } | null } | null
      return {
        tenant_name: tenantName,
        email: c?.email ?? null,
        phone: c?.phone ?? null,
        unit_number: unitRaw?.unit_number ?? "—",
        property_name: unitRaw?.properties?.name ?? "—",
        lease_end: (l.end_date as string | null) ?? null,
        monthly_rent_cents: l.monthly_rent_cents as number ?? 0,
      }
    })

  return {
    as_at: new Date(),
    rows,
    total_active: rows.length,
  }
}
