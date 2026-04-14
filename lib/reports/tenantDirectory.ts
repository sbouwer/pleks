import { createServiceClient } from "@/lib/supabase/server"
import type { TenantDirectoryData, TenantDirectoryRow, ReportFilters } from "./types"

const ACTIVE_STATUSES = ["active", "notice", "month_to_month", "pending_signing"]

type LeaseSummary = {
  id: string
  tenant_id: string
  end_date: string | null
  rent_amount_cents: number | null
  status: string
  units: { unit_number: string; property_id: string; properties: { name: string } | null } | null
}

type ContactData = {
  first_name: string | null
  last_name: string | null
  company_name: string | null
  entity_type: string
  primary_email: string | null
  primary_phone: string | null
}

function buildRow(contact: ContactData | null, lease: LeaseSummary, role: TenantDirectoryRow["role"]): TenantDirectoryRow {
  const tenantName = contact?.entity_type === "company"
    ? (contact.company_name ?? "Tenant")
    : `${contact?.first_name ?? ""} ${contact?.last_name ?? ""}`.trim() || "Tenant"
  return {
    tenant_name: tenantName,
    role,
    email: contact?.primary_email ?? null,
    phone: contact?.primary_phone ?? null,
    unit_number: lease.units?.unit_number ?? "—",
    property_name: lease.units?.properties?.name ?? "—",
    lease_end: lease.end_date ?? null,
    monthly_rent_cents: lease.rent_amount_cents ?? 0,
  }
}

export async function buildTenantDirectory(filters: ReportFilters): Promise<TenantDirectoryData> {
  const db = await createServiceClient()
  const { orgId, propertyIds } = filters

  // Step 1: Get all active leases with unit/property info
  let leasesQuery = db
    .from("leases")
    .select("id, tenant_id, end_date, rent_amount_cents, status, units(unit_number, property_id, properties(name))")
    .eq("org_id", orgId)
    .in("status", ACTIVE_STATUSES)
  if (propertyIds?.length) leasesQuery = leasesQuery.in("property_id", propertyIds)

  const { data: leases, error: lErr } = await leasesQuery
  if (lErr) console.error("tenantDirectory leases:", lErr.message)

  const leaseSummaries = (leases ?? []) as unknown as LeaseSummary[]
  if (leaseSummaries.length === 0) return { as_at: new Date(), rows: [], total_active: 0 }

  const leaseIds = leaseSummaries.map((l) => l.id)

  // Step 2: Get co-tenant IDs for those leases (simple — no nested joins)
  const { data: coTenantLinks, error: ctErr } = await db
    .from("lease_co_tenants")
    .select("lease_id, tenant_id")
    .eq("org_id", orgId)
    .in("lease_id", leaseIds)

  if (ctErr) console.error("tenantDirectory co-tenants:", ctErr.message)

  // Step 3: Collect all tenant IDs and bulk-fetch contacts
  const primaryIds = leaseSummaries.map((l) => l.tenant_id)
  const coIds = (coTenantLinks ?? []).map((ct) => ct.tenant_id as string)
  const allIds = [...new Set([...primaryIds, ...coIds])]

  const { data: tenants, error: tErr } = await db
    .from("tenants")
    .select("id, contacts(first_name, last_name, company_name, entity_type, primary_email, primary_phone)")
    .in("id", allIds)

  if (tErr) console.error("tenantDirectory contacts:", tErr.message)

  type TenantRow = { id: string; contacts: ContactData | null }
  const contactMap = new Map<string, ContactData | null>(
    ((tenants ?? []) as unknown as TenantRow[]).map((t) => [t.id, t.contacts])
  )

  // Build co-tenant map: lease_id → tenant_ids[]
  const coMap = new Map<string, string[]>()
  for (const ct of coTenantLinks ?? []) {
    const lid = ct.lease_id as string
    const existing = coMap.get(lid) ?? []
    existing.push(ct.tenant_id as string)
    coMap.set(lid, existing)
  }

  // Step 4: Build rows — primary tenant first, then co-tenants for each lease
  const rows: TenantDirectoryRow[] = []
  for (const lease of leaseSummaries) {
    rows.push(buildRow(contactMap.get(lease.tenant_id) ?? null, lease, "Primary"))
    for (const coId of coMap.get(lease.id) ?? []) {
      rows.push(buildRow(contactMap.get(coId) ?? null, lease, "Co-tenant"))
    }
  }

  return { as_at: new Date(), rows, total_active: rows.length }
}
