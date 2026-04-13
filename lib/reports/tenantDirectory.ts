import { createServiceClient } from "@/lib/supabase/server"
import type { TenantDirectoryData, TenantDirectoryRow, ReportFilters } from "./types"

const STATUS_PRIORITY = ["active", "notice", "month_to_month", "pending_signing", "draft"]

type LeaseRow = {
  end_date: string | null
  rent_amount_cents: number | null
  status: string
  units: { unit_number: string; property_id: string; properties: { name: string } | null } | null
}

type ProspectiveLeaseRow = LeaseRow & {
  prospective_co_tenant_ids: string[] | null
}

type ContactRow = {
  first_name: string | null
  last_name: string | null
  company_name: string | null
  entity_type: string
  primary_email: string | null
  primary_phone: string | null
}

function bestLease(leases: LeaseRow[]): LeaseRow | null {
  for (const s of STATUS_PRIORITY) {
    const found = leases.find((l) => l.status === s)
    if (found) return found
  }
  return leases[0] ?? null
}

function buildRow(c: ContactRow | null, lease: LeaseRow, role: TenantDirectoryRow["role"]): TenantDirectoryRow {
  const tenantName = c?.entity_type === "company"
    ? (c.company_name ?? "Tenant")
    : `${c?.first_name ?? ""} ${c?.last_name ?? ""}`.trim() || "Tenant"
  return {
    tenant_name: tenantName,
    role,
    email: c?.primary_email ?? null,
    phone: c?.primary_phone ?? null,
    unit_number: lease.units?.unit_number ?? "—",
    property_name: lease.units?.properties?.name ?? "—",
    lease_end: lease.end_date ?? null,
    monthly_rent_cents: lease.rent_amount_cents ?? 0,
  }
}

function inPropertyFilter(lease: LeaseRow, propertyIds: string[] | undefined): boolean {
  if (!propertyIds?.length) return true
  return propertyIds.includes(lease.units?.property_id ?? "")
}

function addPrimaryTenants(tenants: unknown[], propertyIds: string[] | undefined, seen: Set<string>, rows: TenantDirectoryRow[]): void {
  for (const t of tenants as Array<{ id: string; contacts: unknown; leases: unknown }>) {
    const lease = bestLease((t.leases as LeaseRow[]) ?? [])
    if (!lease || !inPropertyFilter(lease, propertyIds)) continue
    seen.add(t.id)
    rows.push(buildRow(t.contacts as ContactRow | null, lease, "Primary"))
  }
}

function addCoTenants(coTenants: unknown[], propertyIds: string[] | undefined, seen: Set<string>, rows: TenantDirectoryRow[]): void {
  for (const ct of coTenants as Array<{ tenant_id: string; leases: unknown; tenants: unknown }>) {
    if (seen.has(ct.tenant_id)) continue
    const lease = ct.leases as LeaseRow | null
    if (!lease || !inPropertyFilter(lease, propertyIds)) continue
    const tRaw = ct.tenants as { contacts: ContactRow | null } | null
    seen.add(ct.tenant_id)
    rows.push(buildRow(tRaw?.contacts ?? null, lease, "Co-tenant"))
  }
}

function collectProspectiveIds(
  prospectiveLeases: ProspectiveLeaseRow[],
  propertyIds: string[] | undefined,
  seen: Set<string>,
): { unseenIds: string[]; idToLease: Map<string, ProspectiveLeaseRow> } {
  const unseenIds: string[] = []
  const idToLease = new Map<string, ProspectiveLeaseRow>()
  for (const lease of prospectiveLeases) {
    if (!lease.prospective_co_tenant_ids?.length) continue
    if (!inPropertyFilter(lease, propertyIds)) continue
    for (const tenantId of lease.prospective_co_tenant_ids) {
      if (!seen.has(tenantId) && !idToLease.has(tenantId)) {
        unseenIds.push(tenantId)
        idToLease.set(tenantId, lease)
      }
    }
  }
  return { unseenIds, idToLease }
}

async function addProspectiveCoTenants(
  db: Awaited<ReturnType<typeof createServiceClient>>,
  prospectiveLeases: ProspectiveLeaseRow[],
  propertyIds: string[] | undefined,
  seen: Set<string>,
  rows: TenantDirectoryRow[],
): Promise<void> {
  const { unseenIds, idToLease } = collectProspectiveIds(prospectiveLeases, propertyIds, seen)
  if (!unseenIds.length) return

  const { data: tenants, error } = await db
    .from("tenants")
    .select("id, contacts(first_name, last_name, company_name, entity_type, primary_email, primary_phone)")
    .in("id", unseenIds)

  if (error) {
    console.error("tenantDirectory prospective co-tenants:", error.message)
    return
  }

  for (const t of (tenants ?? []) as unknown as Array<{ id: string; contacts: ContactRow | null }>) {
    if (seen.has(t.id)) continue
    const lease = idToLease.get(t.id)
    if (!lease) continue
    seen.add(t.id)
    rows.push(buildRow(t.contacts, lease, "Prospective"))
  }
}

export async function buildTenantDirectory(filters: ReportFilters): Promise<TenantDirectoryData> {
  const db = await createServiceClient()
  const { orgId, propertyIds } = filters

  const [{ data: tenants, error: tErr }, { data: coTenants, error: ctErr }, { data: prospectiveLeases, error: plErr }] = await Promise.all([
    db
      .from("tenants")
      .select("id, contacts(first_name, last_name, company_name, entity_type, primary_email, primary_phone), leases(end_date, rent_amount_cents, status, units(unit_number, property_id, properties(name)))")
      .eq("org_id", orgId)
      .is("deleted_at", null),
    db
      .from("lease_co_tenants")
      .select("tenant_id, leases(end_date, rent_amount_cents, status, units(unit_number, property_id, properties(name))), tenants(contacts(first_name, last_name, company_name, entity_type, primary_email, primary_phone))")
      .eq("org_id", orgId),
    db
      .from("leases")
      .select("end_date, rent_amount_cents, status, prospective_co_tenant_ids, units(unit_number, property_id, properties(name))")
      .eq("org_id", orgId)
      .not("prospective_co_tenant_ids", "is", null),
  ])

  if (tErr) console.error("tenantDirectory primary:", tErr.message)
  if (ctErr) console.error("tenantDirectory co-tenants:", ctErr.message)
  if (plErr) console.error("tenantDirectory prospective leases:", plErr.message)

  const seen = new Set<string>()
  const rows: TenantDirectoryRow[] = []
  addPrimaryTenants(tenants ?? [], propertyIds, seen, rows)
  addCoTenants(coTenants ?? [], propertyIds, seen, rows)
  await addProspectiveCoTenants(db, (prospectiveLeases ?? []) as unknown as ProspectiveLeaseRow[], propertyIds, seen, rows)

  return { as_at: new Date(), rows, total_active: rows.length }
}
