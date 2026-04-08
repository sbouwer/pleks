import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { LogMaintenanceForm } from "@/components/maintenance/LogMaintenanceForm"
import type { SupabaseClient } from "@supabase/supabase-js"

interface Props {
  searchParams: Promise<{ property?: string; unit?: string }>
}

type ServiceClient = SupabaseClient

export interface ContactOption {
  role: string    // "tenant" | "agent" | "landlord"
  label: string
  name: string
  phone: string
}

async function resolvePropertyId(service: ServiceClient, unitId: string | undefined, propertyId: string | undefined) {
  if (propertyId ?? !unitId) return propertyId
  const { data } = await service.from("units").select("property_id").eq("id", unitId).single()
  return data?.property_id ?? propertyId
}

async function fetchUnits(service: ServiceClient, propertyId: string | undefined) {
  if (!propertyId) return []
  const { data } = await service
    .from("units")
    .select("id, unit_number, access_instructions, prospective_tenant_id")
    .eq("property_id", propertyId)
    .eq("is_archived", false)
    .is("deleted_at", null)
    .order("unit_number")
  return (data ?? []) as Array<{ id: string; unit_number: string; access_instructions: string | null; prospective_tenant_id: string | null }>
}

async function fetchTenantPrefill(
  service: ServiceClient,
  unitId: string,
  units: Array<{ id: string; unit_number: string; access_instructions: string | null; prospective_tenant_id: string | null }>
) {
  // Use separate query instead of embedded select to avoid array/single ambiguity
  const { data: lease } = await service
    .from("leases")
    .select("id, tenant_id")
    .eq("unit_id", unitId)
    .in("status", ["draft", "pending_signing", "active", "notice", "month_to_month"])
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle()

  let prefillTenant: { id: string; name: string; phone: string | null } | null = null
  let prefillLeaseId: string | null = null

  if (lease?.tenant_id) {
    prefillLeaseId = lease.id
    const { data: tv } = await service
      .from("tenant_view")
      .select("first_name, last_name, phone")
      .eq("id", lease.tenant_id)
      .maybeSingle()
    if (tv) {
      prefillTenant = {
        id: lease.tenant_id as string,
        name: `${tv.first_name ?? ""} ${tv.last_name ?? ""}`.trim(),
        phone: (tv.phone as string | null) ?? null,
      }
    }
  } else {
    // Fallback: prospective tenant linked to the unit
    const unit = units.find((u) => u.id === unitId)
    if (unit?.prospective_tenant_id) {
      const { data: tv } = await service
        .from("tenant_view")
        .select("first_name, last_name, phone")
        .eq("id", unit.prospective_tenant_id)
        .maybeSingle()
      if (tv) {
        prefillTenant = {
          id: unit.prospective_tenant_id,
          name: `${tv.first_name ?? ""} ${tv.last_name ?? ""}`.trim(),
          phone: (tv.phone as string | null) ?? null,
        }
      }
    }
  }

  const prefillAccessInstructions = units.find((u) => u.id === unitId)?.access_instructions ?? null
  return { prefillTenant, prefillLeaseId, prefillAccessInstructions }
}

async function fetchPropertyContacts(service: ServiceClient, propertyId: string): Promise<ContactOption[]> {
  const { data: prop } = await service
    .from("properties")
    .select("managing_agent_id, landlord_id")
    .eq("id", propertyId)
    .maybeSingle()

  if (!prop) return []

  const contacts: ContactOption[] = []

  // Managing agent — via user_profiles
  if (prop.managing_agent_id) {
    const { data: profile } = await service
      .from("user_profiles")
      .select("full_name, phone")
      .eq("id", prop.managing_agent_id)
      .maybeSingle()
    if (profile?.full_name) {
      contacts.push({
        role: "agent",
        label: `Agent — ${profile.full_name}`,
        name: profile.full_name as string,
        phone: (profile.phone as string | null) ?? "",
      })
    }
  }

  // Landlord — via landlords → contacts
  if (prop.landlord_id) {
    const { data: landlordRow } = await service
      .from("landlords")
      .select("contact_id")
      .eq("id", prop.landlord_id)
      .maybeSingle()
    if (landlordRow?.contact_id) {
      const { data: contact } = await service
        .from("contacts")
        .select("first_name, last_name, primary_phone")
        .eq("id", landlordRow.contact_id)
        .maybeSingle()
      if (contact) {
        const name = [contact.first_name, contact.last_name].filter(Boolean).join(" ")
        if (name) {
          contacts.push({
            role: "landlord",
            label: `Landlord — ${name}`,
            name,
            phone: (contact.primary_phone as string | null) ?? "",
          })
        }
      }
    }
  }

  return contacts
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

  // Tenant prefill + property contacts in parallel
  const [tenantResult, propertyContacts] = await Promise.all([
    unitId ? fetchTenantPrefill(service, unitId, units) : Promise.resolve({ prefillTenant: null, prefillLeaseId: null, prefillAccessInstructions: null }),
    propertyId ? fetchPropertyContacts(service, propertyId) : Promise.resolve([] as ContactOption[]),
  ])

  const { prefillTenant, prefillLeaseId, prefillAccessInstructions } = tenantResult

  // Build initial contact options: tenant first, then agent, then landlord
  const initialContacts: ContactOption[] = []
  if (prefillTenant) {
    initialContacts.push({
      role: "tenant",
      label: `Tenant — ${prefillTenant.name}`,
      name: prefillTenant.name,
      phone: prefillTenant.phone ?? "",
    })
  }
  initialContacts.push(...propertyContacts)

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
        initialContacts={initialContacts}
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
