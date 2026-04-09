import { Suspense } from "react"
import { createServiceClient } from "@/lib/supabase/server"
import { getServerOrgMembership } from "@/lib/auth/server"
import { redirect } from "next/navigation"
import { LeasePathFork } from "@/components/leases/LeasePathFork"
import { LeaseDisclaimerGate } from "@/components/leases/LeaseDisclaimerGate"
import { hasAcceptedLeaseDisclaimer } from "@/lib/leases/disclaimer"

interface Props {
  searchParams: Promise<Record<string, string>>
}

type TenantRow = { first_name?: string | null; last_name?: string | null; company_name?: string | null; entity_type?: string | null } | null

function displayName(row: TenantRow): string | null {
  if (!row) return null
  return row.entity_type === "juristic"
    ? (row.company_name ?? "Company")
    : [row.first_name, row.last_name].filter(Boolean).join(" ") || null
}

type SupabaseService = Awaited<ReturnType<typeof createServiceClient>>

interface OwnerPrefillResult {
  propertyId: string
  unitId: string
  tenantId: string | null
  resolvedTenantName: string | null
  resolvedCoTenants: { id: string; name: string }[]
}

type ProspectiveTenantResult = { tenantId: string; resolvedTenantName: string | null; resolvedCoTenants: { id: string; name: string }[] } | null

async function resolveProspectiveTenant(
  supabase: SupabaseService,
  prospectiveTenantId: string,
  prospCoIds: string[],
): Promise<ProspectiveTenantResult> {
  const fetchCoTenant = (id: string) =>
    supabase.from("tenant_view").select("first_name, last_name, company_name, entity_type").eq("id", id).single()
      .then((r) => ({ id, data: r.data as TenantRow }))

  const [primRes, ...coResArr] = await Promise.all([
    supabase.from("tenant_view").select("first_name, last_name, company_name, entity_type").eq("id", prospectiveTenantId).single(),
    ...prospCoIds.map(fetchCoTenant),
  ])
  if (!primRes.data) return null
  return {
    tenantId: prospectiveTenantId,
    resolvedTenantName: displayName(primRes.data as TenantRow),
    resolvedCoTenants: coResArr.map((r) => ({ id: r.id, name: displayName(r.data) ?? r.id })),
  }
}

async function prefillOwnerTier(
  supabase: SupabaseService,
  orgId: string,
  existingTenantId: string | null,
): Promise<OwnerPrefillResult | null> {
  const { data: ownerProp } = await supabase
    .from("properties")
    .select("id")
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .limit(1)
    .single()
  if (!ownerProp) return null

  const { data: ownerUnit } = await supabase
    .from("units")
    .select("id, prospective_tenant_id, prospective_co_tenant_ids")
    .eq("property_id", ownerProp.id)
    .is("deleted_at", null)
    .eq("is_archived", false)
    .limit(1)
    .single()

  const u = ownerUnit as unknown as { id: string; prospective_tenant_id?: string | null; prospective_co_tenant_ids?: string[] } | null
  const noTenantResult: OwnerPrefillResult = { propertyId: ownerProp.id, unitId: u?.id ?? "", tenantId: null, resolvedTenantName: null, resolvedCoTenants: [] }

  if (!u) return noTenantResult
  if (existingTenantId || !u.prospective_tenant_id) return noTenantResult

  const resolved = await resolveProspectiveTenant(supabase, u.prospective_tenant_id, u.prospective_co_tenant_ids ?? [])
  if (!resolved) return noTenantResult
  return { propertyId: ownerProp.id, unitId: u.id, ...resolved }
}

function buildUnitLabel(unitData: { unit_number: string | null; bedrooms: number | null; bathrooms: number | null } | null): string | null {
  if (!unitData) return null
  return [
    unitData.unit_number ? `Unit ${unitData.unit_number}` : "Unit",
    unitData.bedrooms ? `${unitData.bedrooms} bed` : null,
    unitData.bathrooms ? `${unitData.bathrooms} bath` : null,
  ].filter(Boolean).join(" — ")
}

export default async function NewLeasePage({ searchParams }: Readonly<Props>) {
  const membership = await getServerOrgMembership()
  if (!membership) redirect("/login")

  const accepted = await hasAcceptedLeaseDisclaimer()

  const { org_id: orgId } = membership
  const supabase = await createServiceClient()

  const sp = await searchParams
  const renewalOf = sp.renewal_of ?? null

  let propertyId = sp.property ?? null
  let unitId = sp.unit ?? null
  let tenantId = sp.tenant ?? null
  let resolvedTenantName: string | null = null
  let resolvedCoTenants: { id: string; name: string }[] = []
  const coTenantIds = sp.co_tenants ? sp.co_tenants.split(",").filter(Boolean) : []

  // Owner tier: auto-prefill the single property + unit (and prospective tenant)
  if (!propertyId && membership.tier === "owner") {
    const prefill = await prefillOwnerTier(supabase, orgId, tenantId)
    if (prefill) {
      propertyId = prefill.propertyId
      if (prefill.unitId) unitId = prefill.unitId
      if (prefill.tenantId) tenantId = prefill.tenantId
      resolvedTenantName = prefill.resolvedTenantName
      resolvedCoTenants = prefill.resolvedCoTenants
    }
  }

  // Fetch display names for remaining pre-filled IDs
  const [propRes, unitRes, tenantRes, ...coTenantResults] = await Promise.all([
    propertyId
      ? supabase.from("properties").select("name").eq("id", propertyId).eq("org_id", orgId).single()
      : Promise.resolve({ data: null }),
    unitId
      ? supabase.from("units").select("unit_number, bedrooms, bathrooms").eq("id", unitId).single()
      : Promise.resolve({ data: null }),
    tenantId && !resolvedTenantName
      ? supabase.from("tenant_view").select("first_name, last_name, company_name, entity_type").eq("id", tenantId).single()
      : Promise.resolve({ data: null }),
    ...coTenantIds.map((id) =>
      supabase.from("tenant_view").select("first_name, last_name, company_name, entity_type").eq("id", id).single()
        .then((res) => ({ id, data: res.data as TenantRow }))
    ),
  ])

  const propName = propRes.data?.name ?? null
  const unitData = unitRes.data as { unit_number: string | null; bedrooms: number | null; bathrooms: number | null } | null
  const unitLabel = buildUnitLabel(unitData)

  const finalTenantName = resolvedTenantName ?? displayName(tenantRes.data as TenantRow)
  const finalCoTenants = resolvedCoTenants.length > 0
    ? resolvedCoTenants
    : coTenantResults.map((r) => ({ id: r.id, name: displayName(r.data) ?? r.id }))

  return (
    <LeaseDisclaimerGate initialAccepted={accepted}>
      <div>
        <h1 className="font-heading text-2xl mb-6">Create lease</h1>
        <Suspense fallback={<div className="text-sm text-muted-foreground">Loading…</div>}>
          <LeasePathFork
            initialPropertyId={propertyId}
            initialPropertyName={propName}
            initialUnitId={unitId}
            initialUnitLabel={unitLabel}
            initialTenantId={tenantId}
            initialTenantName={finalTenantName}
            initialCoTenants={finalCoTenants}
            renewalOf={renewalOf}
          />
        </Suspense>
      </div>
    </LeaseDisclaimerGate>
  )
}
