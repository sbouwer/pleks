import { Suspense } from "react"
import { createClient } from "@/lib/supabase/server"
import { getServerOrgMembership } from "@/lib/auth/server"
import { redirect } from "next/navigation"
import { LeaseWizard } from "@/components/leases/LeaseWizard"

interface Props {
  searchParams: Promise<Record<string, string>>
}

export default async function NewLeasePage({ searchParams }: Readonly<Props>) {
  const membership = await getServerOrgMembership()
  if (!membership) redirect("/login")

  const { org_id: orgId } = membership
  const supabase = await createClient()

  const sp = await searchParams
  const renewalOf = sp.renewal_of ?? null
  const coTenantIds = sp.co_tenants ? sp.co_tenants.split(",").filter(Boolean) : []

  // Owner tier: 1 property + 1 unit — auto-prefill if no params provided
  let propertyId = sp.property ?? null
  let unitId = sp.unit ?? null
  const tenantId = sp.tenant ?? null

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
      if (!unitId) {
        const { data: ownerUnit } = await supabase
          .from("units")
          .select("id")
          .eq("property_id", ownerProp.id)
          .is("deleted_at", null)
          .eq("is_archived", false)
          .limit(1)
          .single()
        if (ownerUnit) unitId = ownerUnit.id
      }
    }
  }

  // Fetch display names for pre-filled IDs in parallel
  const [propRes, unitRes, tenantRes, ...coTenantResults] = await Promise.all([
    propertyId
      ? supabase.from("properties").select("name").eq("id", propertyId).eq("org_id", orgId).single()
      : Promise.resolve({ data: null }),
    unitId
      ? supabase.from("units").select("unit_number, bedrooms, bathrooms").eq("id", unitId).single()
      : Promise.resolve({ data: null }),
    tenantId
      ? supabase.from("tenant_view").select("first_name, last_name, company_name, entity_type").eq("id", tenantId).single()
      : Promise.resolve({ data: null }),
    ...coTenantIds.map((id) =>
      supabase.from("tenant_view").select("first_name, last_name, company_name, entity_type").eq("id", id).single()
        .then((res) => ({ id, data: res.data }))
    ),
  ])

  const propName = propRes.data?.name ?? null
  const unitData = unitRes.data as { unit_number: string | null; bedrooms: number | null; bathrooms: number | null } | null
  const unitLabel = unitData
    ? [
        unitData.unit_number ? `Unit ${unitData.unit_number}` : "Unit",
        unitData.bedrooms ? `${unitData.bedrooms} bed` : null,
        unitData.bathrooms ? `${unitData.bathrooms} bath` : null,
      ]
        .filter(Boolean)
        .join(" — ")
    : null

  type TenantRow = { first_name?: string | null; last_name?: string | null; company_name?: string | null; entity_type?: string | null } | null
  function displayName(row: TenantRow) {
    if (!row) return null
    return row.entity_type === "juristic"
      ? (row.company_name ?? "Company")
      : [row.first_name, row.last_name].filter(Boolean).join(" ") || null
  }

  const coTenants = (coTenantResults as { id: string; data: TenantRow }[])
    .map((r) => ({ id: r.id, name: displayName(r.data) ?? r.id }))

  return (
    <div className="max-w-2xl">
      <h1 className="font-heading text-2xl mb-6">Create lease</h1>
      <Suspense fallback={<div className="text-sm text-muted-foreground">Loading…</div>}>
        <LeaseWizard
          initialPropertyId={propertyId}
          initialPropertyName={propName}
          initialUnitId={unitId}
          initialUnitLabel={unitLabel}
          initialTenantId={tenantId}
          initialTenantName={displayName(tenantRes.data)}
          initialCoTenants={coTenants}
          renewalOf={renewalOf}
        />
      </Suspense>
    </div>
  )
}
