import { createClient } from "@/lib/supabase/server"
import { getServerOrgMembership } from "@/lib/auth/server"
import { redirect } from "next/navigation"
import { NewInspectionForm } from "./NewInspectionForm"
import type { SupabaseClient } from "@supabase/supabase-js"
import { BackLink } from "@/components/ui/BackLink"

interface Props {
  searchParams: Promise<Record<string, string>>
}

async function resolvePropertyId(supabase: SupabaseClient, unitId: string | null, propertyId: string | null) {
  if (propertyId || !unitId) return propertyId
  const { data } = await supabase.from("units").select("property_id").eq("id", unitId).single()
  return data?.property_id ?? null
}

function buildUnitLabel(unit: { unit_number: string | null; bedrooms: number | null } | null) {
  if (!unit) return null
  const base = unit.unit_number ? `Unit ${unit.unit_number}` : "Unit"
  const beds = unit.bedrooms ? ` — ${unit.bedrooms} bed` : ""
  return base + beds
}

async function resolveTenantName(supabase: SupabaseClient, tenantId: string | null) {
  if (!tenantId) return null
  const { data: tv } = await supabase
    .from("tenant_view")
    .select("first_name, last_name, company_name, entity_type")
    .eq("id", tenantId)
    .single()
  if (!tv) return null
  return tv.entity_type === "juristic"
    ? (tv.company_name ?? "Company")
    : [tv.first_name, tv.last_name].filter(Boolean).join(" ")
}

export default async function NewInspectionPage({ searchParams }: Readonly<Props>) {
  const membership = await getServerOrgMembership()
  if (!membership) redirect("/login")

  const { org_id: orgId } = membership
  const supabase = await createClient()

  const sp = await searchParams
  const unitId = sp.unit ?? null
  const leaseId = sp.lease ?? null
  const typeParam = sp.type ?? null

  // If only unit is given (e.g. from a unit quick-action), look up the property
  const propertyId = await resolvePropertyId(supabase, unitId, sp.property ?? null)

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

  const tenantId = leaseRes.data?.tenant_id ?? null
  const tenantName = await resolveTenantName(supabase, tenantId)

  return (
    <div className="max-w-2xl">
      <BackLink href="/inspections" label="Inspections" />
      <h1 className="font-heading text-3xl mb-6">Schedule inspection</h1>
      <NewInspectionForm
        orgId={orgId}
        initialPropertyId={propertyId}
        initialPropertyName={propRes.data?.name ?? null}
        initialUnitId={unitId}
        initialUnitLabel={buildUnitLabel(unitRes.data ?? null)}
        initialLeaseId={leaseId}
        initialLeaseType={(leaseRes.data?.lease_type ?? null) as "residential" | "commercial" | null}
        initialTenantId={tenantId}
        initialTenantName={tenantName}
        initialType={typeParam}
      />
    </div>
  )
}
