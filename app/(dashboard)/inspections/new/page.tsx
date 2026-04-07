import { createClient } from "@/lib/supabase/server"
import { getServerOrgMembership } from "@/lib/auth/server"
import { redirect } from "next/navigation"
import { NewInspectionForm } from "./NewInspectionForm"

interface Props {
  searchParams: Promise<Record<string, string>>
}

export default async function NewInspectionPage({ searchParams }: Readonly<Props>) {
  const membership = await getServerOrgMembership()
  if (!membership) redirect("/login")

  const { org_id: orgId } = membership
  const supabase = await createClient()

  const sp = await searchParams
  const propertyId = sp.property ?? null
  const unitId = sp.unit ?? null
  const leaseId = sp.lease ?? null
  const typeParam = sp.type ?? null

  // Fetch display names for pre-filled IDs in parallel
  const [propRes, unitRes, leaseRes] = await Promise.all([
    propertyId
      ? supabase.from("properties").select("name").eq("id", propertyId).single()
      : Promise.resolve({ data: null }),
    unitId
      ? supabase.from("units").select("unit_number, bedrooms").eq("id", unitId).single()
      : Promise.resolve({ data: null }),
    leaseId
      ? supabase.from("leases").select("tenant_id, lease_type").eq("id", leaseId).single()
      : Promise.resolve({ data: null }),
  ])

  const propertyName = propRes.data?.name ?? null
  const leaseType = leaseRes.data?.lease_type ?? null
  const tenantId = leaseRes.data?.tenant_id ?? null

  let unitLabel: string | null = null
  if (unitRes.data) {
    const base = unitRes.data.unit_number ? `Unit ${unitRes.data.unit_number}` : "Unit"
    const beds = unitRes.data.bedrooms ? ` — ${unitRes.data.bedrooms} bed` : ""
    unitLabel = base + beds
  }

  // Fetch tenant display name if we have one
  let tenantName: string | null = null
  if (tenantId) {
    const { data: tv } = await supabase
      .from("tenant_view")
      .select("first_name, last_name, company_name, entity_type")
      .eq("id", tenantId)
      .single()
    if (tv) {
      tenantName = tv.entity_type === "juristic"
        ? (tv.company_name ?? "Company")
        : [tv.first_name, tv.last_name].filter(Boolean).join(" ")
    }
  }

  return (
    <div className="max-w-2xl">
      <h1 className="font-heading text-3xl mb-6">Schedule inspection</h1>
      <NewInspectionForm
        orgId={orgId}
        initialPropertyId={propertyId}
        initialPropertyName={propertyName}
        initialUnitId={unitId}
        initialUnitLabel={unitLabel}
        initialLeaseId={leaseId}
        initialLeaseType={leaseType as "residential" | "commercial" | null}
        initialTenantId={tenantId}
        initialTenantName={tenantName}
        initialType={typeParam}
      />
    </div>
  )
}
