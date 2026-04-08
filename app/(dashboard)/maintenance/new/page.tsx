import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { LogMaintenanceForm } from "@/components/maintenance/LogMaintenanceForm"

interface Props {
  searchParams: Promise<{ property?: string; unit?: string }>
}

export default async function NewMaintenancePage({ searchParams }: Props) {
  const sp = await searchParams
  let propertyId = sp.property ?? undefined
  const unitId = sp.unit ?? undefined

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

  // If only unit is given (e.g. from a property page quick-action), look up the property
  if (unitId && !propertyId) {
    const { data: unitRow } = await service
      .from("units")
      .select("property_id")
      .eq("id", unitId)
      .single()
    if (unitRow) propertyId = unitRow.property_id
  }

  // Fetch properties for picker
  const { data: properties } = await service
    .from("properties")
    .select("id, name, address_line1, city")
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .order("name")

  // Fetch units for selected property
  let units: Array<{ id: string; unit_number: string; access_instructions: string | null }> = []
  if (propertyId) {
    const { data } = await service
      .from("units")
      .select("id, unit_number, access_instructions")
      .eq("property_id", propertyId)
      .order("unit_number")
    units = data ?? []
  }

  // Fetch tenant from active lease on selected unit
  let prefillTenant: { id: string; name: string; phone: string | null } | null = null
  let prefillLeaseId: string | null = null
  let prefillAccessInstructions: string | null = null
  if (unitId) {
    const { data: lease } = await service
      .from("leases")
      .select("id, tenant_id, tenant_view(first_name, last_name, phone)")
      .eq("unit_id", unitId)
      .in("status", ["active", "signed"])
      .order("start_date", { ascending: false })
      .limit(1)
      .single()

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

    // Access instructions from unit record
    const unit = units.find((u) => u.id === unitId)
    prefillAccessInstructions = unit?.access_instructions ?? null
  }

  // Org approval threshold
  const { data: org } = await service
    .from("organisations")
    .select("maintenance_approval_threshold_cents")
    .eq("id", orgId)
    .single()
  const approvalThresholdCents = (org?.maintenance_approval_threshold_cents as number | null) ?? 200000

  // Active contractors
  const { data: contractors } = await service
    .from("contractor_view")
    .select("id, first_name, last_name, company_name, specialities, is_active")
    .eq("org_id", orgId)
    .eq("is_active", true)
    .order("company_name")

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
        properties={properties ?? []}
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
