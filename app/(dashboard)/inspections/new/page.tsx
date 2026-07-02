/**
 * app/(dashboard)/inspections/new/page.tsx — schedule-inspection form, pre-filled from query params
 *
 * Route:  /inspections/new?unit=&lease=&property=&type=&date=&time=
 * Auth:   gatewaySSR() (agent session + org membership)
 * Data:   units / properties / leases / tenant_view lookups to resolve display names for pre-filled IDs,
 *         all org-scoped via gatewaySSR orgId (the IDs come from caller-supplied query params).
 */
import { gatewaySSR } from "@/lib/supabase/gateway"
import { redirect } from "next/navigation"
import { NewInspectionForm } from "./NewInspectionForm"
import type { SupabaseClient } from "@supabase/supabase-js"
import { BackLink } from "@/components/ui/BackLink"
import { contactDisplayName } from "@/lib/contacts/displayName"
import { logQueryError } from "@/lib/supabase/logQueryError"

interface Props {
  searchParams: Promise<Record<string, string>>
}

async function resolvePropertyId(db: SupabaseClient, orgId: string, unitId: string | null, propertyId: string | null) {
  if (propertyId || !unitId) return propertyId
  const { data, error: queryError } = await db.from("units").select("property_id").eq("id", unitId).eq("org_id", orgId).single()
    logQueryError("resolvePropertyId units", queryError)
  return data?.property_id ?? null
}

function buildUnitLabel(unit: { unit_number: string | null; bedrooms: number | null } | null) {
  if (!unit) return null
  const base = unit.unit_number ? `Unit ${unit.unit_number}` : "Unit"
  const beds = unit.bedrooms ? ` — ${unit.bedrooms} bed` : ""
  return base + beds
}

async function resolveTenantName(db: SupabaseClient, orgId: string, tenantId: string | null) {
  if (!tenantId) return null
  const { data: tv, error: tvError } = await db
    .from("tenant_view")
    .select("first_name, last_name, company_name, entity_type")
    .eq("id", tenantId)
    .eq("org_id", orgId)
    .single()
    logQueryError("resolveTenantName tenant_view", tvError)
  if (!tv) return null
  return contactDisplayName(tv, "")
}

export default async function NewInspectionPage({ searchParams }: Readonly<Props>) {
  const gw = await gatewaySSR()
  if (!gw) redirect("/login")
  const { db, orgId } = gw

  const sp = await searchParams
  const unitId = sp.unit ?? null
  const leaseId = sp.lease ?? null
  const typeParam = sp.type ?? null
  const dateParam = sp.date ?? null   // prefilled from a calendar day-click (?date=YYYY-MM-DD)
  const timeParam = sp.time ?? null   // prefilled from a week/day time-slot click (?time=HH:MM)

  // If only unit is given (e.g. from a unit quick-action), look up the property
  const propertyId = await resolvePropertyId(db, orgId, unitId, sp.property ?? null)

  // Fetch display names for pre-filled IDs in parallel
  const [propRes, unitRes, leaseRes] = await Promise.all([
    propertyId
      ? db.from("properties").select("name").eq("id", propertyId).eq("org_id", orgId).single()
      : Promise.resolve({ data: null }),
    unitId
      ? db.from("units").select("unit_number, bedrooms").eq("id", unitId).eq("org_id", orgId).single()
      : Promise.resolve({ data: null }),
    leaseId
      ? db.from("leases").select("tenant_id, lease_type").eq("id", leaseId).eq("org_id", orgId).single()
      : Promise.resolve({ data: null }),
  ])

  const tenantId = leaseRes.data?.tenant_id ?? null
  const tenantName = await resolveTenantName(db, orgId, tenantId)

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
        initialScheduledDate={dateParam}
        initialScheduledTime={timeParam}
      />
    </div>
  )
}
