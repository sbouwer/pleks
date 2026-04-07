import { Suspense } from "react"
import { createClient } from "@/lib/supabase/server"
import { getServerOrgMembership } from "@/lib/auth/server"
import { redirect } from "next/navigation"
import { LeaseWizard } from "@/components/leases/LeaseWizard"

interface Props {
  searchParams: Record<string, string>
}

export default async function NewLeasePage({ searchParams }: Readonly<Props>) {
  const membership = await getServerOrgMembership()
  if (!membership) redirect("/login")

  const { org_id: orgId } = membership
  const supabase = await createClient()

  const propertyId = searchParams.property ?? null
  const unitId = searchParams.unit ?? null
  const tenantId = searchParams.tenant ?? null
  const renewalOf = searchParams.renewal_of ?? null

  // Fetch display names for pre-filled IDs in parallel
  const [propRes, unitRes, tenantRes] = await Promise.all([
    propertyId
      ? supabase.from("properties").select("name").eq("id", propertyId).eq("org_id", orgId).single()
      : Promise.resolve({ data: null }),
    unitId
      ? supabase.from("units").select("unit_number, bedrooms, bathrooms").eq("id", unitId).single()
      : Promise.resolve({ data: null }),
    tenantId
      ? supabase.from("tenants").select("contact:contacts(first_name, last_name)").eq("id", tenantId).eq("org_id", orgId).single()
      : Promise.resolve({ data: null }),
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

  const tenantContact = (tenantRes.data as { contact: { first_name: string; last_name: string } | null } | null)
    ?.contact
  const tenantName = tenantContact ? `${tenantContact.first_name} ${tenantContact.last_name}`.trim() : null

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
          initialTenantName={tenantName}
          renewalOf={renewalOf}
        />
      </Suspense>
    </div>
  )
}
