import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { LogMaintenanceForm } from "@/components/maintenance/LogMaintenanceForm"
import type { SupabaseClient } from "@supabase/supabase-js"

interface Props {
  searchParams: Promise<{ property?: string; unit?: string }>
}

type ServiceClient = SupabaseClient

async function resolvePropertyId(service: ServiceClient, unitId: string | undefined, propertyId: string | undefined) {
  if (propertyId ?? !unitId) return propertyId
  const { data } = await service.from("units").select("property_id").eq("id", unitId).single()
  return data?.property_id ?? propertyId
}

async function fetchUnits(service: ServiceClient, propertyId: string | undefined) {
  if (!propertyId) return []
  const { data } = await service
    .from("units")
    .select("id, unit_number, access_instructions")
    .eq("property_id", propertyId)
    .eq("is_archived", false)
    .is("deleted_at", null)
    .order("unit_number")
  return data ?? []
}

async function fetchTenantPrefill(service: ServiceClient, unitId: string, units: Array<{ id: string; unit_number: string; access_instructions: string | null }>) {
  const { data: lease } = await service
    .from("leases")
    .select("id, tenant_id, tenant_view(first_name, last_name, phone)")
    .eq("unit_id", unitId)
    .in("status", ["active", "signed"])
    .order("start_date", { ascending: false })
    .limit(1)
    .single()

  let prefillTenant: { id: string; name: string; phone: string | null } | null = null
  let prefillLeaseId: string | null = null

  if (lease) {
    prefillLeaseId = lease.id
    const tv = lease.tenant_view as unknown as { first_name: string; last_name: string; phone: string } | null
    if (tv && lease.tenant_id) {
      prefillTenant = {
        id: lease.tenant_id as string,
        name: `${tv.first_name ?? ""} ${tv.last_name ?? ""}`.trim(),
        phone: tv.phone ?? null,
      }
    }
  }

  const prefillAccessInstructions = units.find((u) => u.id === unitId)?.access_instructions ?? null
  return { prefillTenant, prefillLeaseId, prefillAccessInstructions }
}

export default async function NewMaintenancePage({ searchParams }: Readonly<Props>) {
  const sp = await searchParams

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const service = await createServiceClient()

  const { data: membership } = await service
    .from("user_orgs")
    .select("org_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single()

  if (!membership) redirect("/onboarding")
  const orgId = membership.org_id

  // Fetch properties + resolve property from unit if needed
  const [{ data: properties }, rawPropertyId] = await Promise.all([
    service.from("properties").select("id, name, address_line1, city").eq("org_id", orgId).is("deleted_at", null).order("name"),
    resolvePropertyId(service, sp.unit, sp.property),
  ])

  // Auto-select the only property (owner / single-property org)
  const propList = properties ?? []
  const propertyId = rawPropertyId ?? (propList.length === 1 ? propList[0].id : undefined)

  // Fetch units + auto-select if only one
  const units = await fetchUnits(service, propertyId)
  const unitId = sp.unit ?? (units.length === 1 ? units[0].id : undefined)

  // Tenant prefill
  const { prefillTenant, prefillLeaseId, prefillAccessInstructions } =
    unitId ? await fetchTenantPrefill(service, unitId, units) : { prefillTenant: null, prefillLeaseId: null, prefillAccessInstructions: null }

  // Org settings + contractors in parallel
  const [{ data: org }, { data: contractors }] = await Promise.all([
    service.from("organisations").select("maintenance_approval_threshold_cents").eq("id", orgId).single(),
    service.from("contractor_view").select("id, first_name, last_name, company_name, specialities, is_active").eq("org_id", orgId).eq("is_active", true).order("company_name"),
  ])

  const approvalThresholdCents = (org?.maintenance_approval_threshold_cents as number | null) ?? 200000

  return (
    <div className="max-w-2xl">
      <div className="mb-6">
        <h1 className="font-heading text-3xl">Log maintenance request</h1>
        <p className="text-muted-foreground mt-1">
          Describe the issue and we&apos;ll help classify and assign it.
        </p>
      </div>
      <LogMaintenanceForm
        orgId={orgId}
        properties={propList}
        initialPropertyId={propertyId ?? null}
        initialUnits={units}
        initialUnitId={unitId ?? null}
        initialTenant={prefillTenant}
        initialLeaseId={prefillLeaseId}
        initialAccessInstructions={prefillAccessInstructions}
        approvalThresholdCents={approvalThresholdCents}
        contractors={(contractors ?? []).map((c) => ({
          id: c.id,
          name: (c.company_name || `${c.first_name ?? ""} ${c.last_name ?? ""}`.trim()) || "Unnamed",
          specialities: (c.specialities as string[] | null) ?? [],
        }))}
      />
    </div>
  )
}
