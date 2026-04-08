import { Suspense } from "react"
import { createServiceClient } from "@/lib/supabase/server"
import { getServerOrgMembership } from "@/lib/auth/server"
import { redirect } from "next/navigation"
import { LeaseWizard } from "@/components/leases/LeaseWizard"
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
    const { data: ownerProp } = await supabase
      .from("properties")
      .select("id")
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .limit(1)
      .single()

    if (ownerProp) {
      propertyId = ownerProp.id

      const { data: ownerUnit } = await supabase
        .from("units")
        .select("id, prospective_tenant_id, prospective_co_tenant_ids")
        .eq("property_id", ownerProp.id)
        .is("deleted_at", null)
        .eq("is_archived", false)
        .limit(1)
        .single()

      if (ownerUnit) {
        const u = ownerUnit as unknown as { id: string; prospective_tenant_id?: string | null; prospective_co_tenant_ids?: string[] }
        unitId = u.id

        if (!tenantId && u.prospective_tenant_id) {
          const prospCoIds = u.prospective_co_tenant_ids ?? []
          const [primRes, ...coResArr] = await Promise.all([
            supabase.from("tenant_view").select("first_name, last_name, company_name, entity_type").eq("id", u.prospective_tenant_id).single(),
            ...prospCoIds.map((id) =>
              supabase.from("tenant_view").select("first_name, last_name, company_name, entity_type").eq("id", id).single()
                .then((r) => ({ id, data: r.data as TenantRow }))
            ),
          ])
          if (primRes.data) {
            tenantId = u.prospective_tenant_id
            resolvedTenantName = displayName(primRes.data as TenantRow)
            resolvedCoTenants = coResArr.map((r) => ({ id: r.id, name: displayName(r.data) ?? r.id }))
          }
        }
      }
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
  const unitLabel = unitData
    ? [
        unitData.unit_number ? `Unit ${unitData.unit_number}` : "Unit",
        unitData.bedrooms ? `${unitData.bedrooms} bed` : null,
        unitData.bathrooms ? `${unitData.bathrooms} bath` : null,
      ].filter(Boolean).join(" — ")
    : null

  const finalTenantName = resolvedTenantName ?? displayName(tenantRes.data as TenantRow)
  const finalCoTenants = resolvedCoTenants.length > 0
    ? resolvedCoTenants
    : coTenantResults.map((r) => ({ id: r.id, name: displayName(r.data) ?? r.id }))

  return (
    <LeaseDisclaimerGate initialAccepted={accepted}>
      <div>
        <h1 className="font-heading text-2xl mb-6">Create lease</h1>
        <Suspense fallback={<div className="text-sm text-muted-foreground">Loading…</div>}>
          <LeaseWizard
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
