import { createServiceClient } from "@/lib/supabase/server"
import type { TenantDirectoryData, TenantDirectoryRow, ReportFilters } from "./types"

const STATUS_PRIORITY = ["active", "notice", "month_to_month", "pending_signing", "draft"]

type LeaseRow = {
  end_date: string | null
  rent_amount_cents: number | null
  status: string
  units: { unit_number: string; property_id: string; properties: { name: string } | null } | null
}

export async function buildTenantDirectory(filters: ReportFilters): Promise<TenantDirectoryData> {
  const db = await createServiceClient()
  const { orgId, propertyIds } = filters

  const { data, error } = await db
    .from("tenants")
    .select("id, contacts(first_name, last_name, company_name, entity_type, primary_email, primary_phone), leases(end_date, rent_amount_cents, status, units(unit_number, property_id, properties(name)))")
    .eq("org_id", orgId)
    .is("deleted_at", null)

  if (error) console.error("tenantDirectory:", error.message)
  console.log("tenantDirectory: orgId=", orgId, "tenants=", data?.length ?? 0)

  const rows: TenantDirectoryRow[] = []

  for (const t of data ?? []) {
    const c = t.contacts as unknown as { first_name: string | null; last_name: string | null; company_name: string | null; entity_type: string; primary_email: string | null; primary_phone: string | null } | null
    const leases = (t.leases as unknown as LeaseRow[]) ?? []

    const lease = STATUS_PRIORITY.reduce<LeaseRow | null>((best, s) => best ?? leases.find((l) => l.status === s) ?? null, null)
    if (!lease) continue

    const unit = lease.units
    if (propertyIds?.length && !propertyIds.includes(unit?.property_id ?? "")) continue

    const tenantName = c?.entity_type === "company"
      ? (c.company_name ?? "Tenant")
      : `${c?.first_name ?? ""} ${c?.last_name ?? ""}`.trim() || "Tenant"

    rows.push({
      tenant_name: tenantName,
      email: c?.primary_email ?? null,
      phone: c?.primary_phone ?? null,
      unit_number: unit?.unit_number ?? "—",
      property_name: unit?.properties?.name ?? "—",
      lease_end: lease.end_date ?? null,
      monthly_rent_cents: lease.rent_amount_cents ?? 0,
    })
  }

  return {
    as_at: new Date(),
    rows,
    total_active: rows.length,
  }
}
