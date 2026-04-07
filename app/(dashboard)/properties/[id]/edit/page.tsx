import { notFound, redirect } from "next/navigation"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { getServerOrgMembership } from "@/lib/auth/server"
import { getOrgTier } from "@/lib/tier/getOrgTier"
import { updateProperty } from "@/lib/actions/properties"
import { PropertyEditForm } from "../../PropertyEditForm"

export default async function EditPropertyPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params

  const membership = await getServerOrgMembership()
  if (!membership) redirect("/login")
  const { org_id: orgId } = membership

  const [supabase, service] = await Promise.all([createClient(), createServiceClient()])

  const tier = await getOrgTier(orgId)

  const [
    { data: property },
    { data: allLandlords },
    { data: unitsData },
    { data: managingSchemes },
    { data: teamMembersData },
  ] = await Promise.all([
    supabase
      .from("properties")
      .select(
        "id, name, type, address_line1, address_line2, suburb, city, province, postal_code, is_sectional_title, managing_scheme_id, levy_amount_cents, levy_account_number, erf_number, sectional_title_number, notes, landlord_id, managing_agent_id"
      )
      .eq("id", id)
      .is("deleted_at", null)
      .single(),

    supabase
      .from("landlord_view")
      .select("id, first_name, last_name, company_name, email, phone")
      .eq("org_id", orgId)
      .is("deleted_at", null),

    supabase
      .from("units")
      .select(
        "id, unit_number, status, is_archived, leases(id, status, tenant:tenants!tenant_id(id, contact:contacts(first_name, last_name)))"
      )
      .eq("property_id", id)
      .is("deleted_at", null)
      .order("unit_number"),

    supabase
      .from("contractors")
      .select("id, company_name")
      .eq("org_id", orgId)
      .eq("supplier_type", "managing_scheme")
      .is("deleted_at", null),

    service
      .from("user_orgs")
      .select("user_id, role, user_profiles(full_name)")
      .eq("org_id", orgId)
      .is("deleted_at", null),
  ])

  if (!property) notFound()

  const currentLandlord = property.landlord_id
    ? await supabase
        .from("landlord_view")
        .select("id, first_name, last_name, company_name, email, phone")
        .eq("id", property.landlord_id)
        .single()
        .then((r) => r.data)
    : null

  const teamMembers = (teamMembersData ?? []).map((m) => {
    const profile = m.user_profiles as unknown as { full_name: string | null }
    return { userId: m.user_id, name: profile?.full_name ?? "Unnamed", role: m.role }
  })

  const unitsSummary = (unitsData ?? [])
    .filter((u) => !u.is_archived)
    .map((u) => {
      const activeLease = (u.leases as unknown as Array<{
        status: string
        tenant: { contact: { first_name: string; last_name: string } | null } | null
      }>)?.find((l) => ["active", "notice", "month_to_month"].includes(l.status))
      const tenant = activeLease?.tenant?.contact
      const tenantName = tenant ? `${tenant.first_name} ${tenant.last_name}`.trim() : null
      return { id: u.id, unit_number: u.unit_number, status: u.status, tenantName }
    })

  const boundAction = updateProperty.bind(null, id)

  return (
    <PropertyEditForm
      propertyId={id}
      orgId={orgId}
      tier={tier}
      action={boundAction}
      defaultValues={{
        name: property.name,
        type: property.type,
        address_line1: property.address_line1,
        address_line2: property.address_line2 ?? null,
        suburb: property.suburb ?? null,
        city: property.city,
        province: property.province,
        postal_code: property.postal_code ?? null,
        is_sectional_title: property.is_sectional_title ?? null,
        managing_scheme_id: property.managing_scheme_id ?? null,
        levy_amount_cents: property.levy_amount_cents ?? null,
        levy_account_number: property.levy_account_number ?? null,
        erf_number: property.erf_number ?? null,
        sectional_title_number: property.sectional_title_number ?? null,
        notes: property.notes ?? null,
      }}
      managingSchemes={managingSchemes ?? []}
      currentLandlord={currentLandlord}
      allLandlords={allLandlords ?? []}
      units={unitsSummary}
      teamMembers={teamMembers}
      managingAgentId={property.managing_agent_id ?? null}
    />
  )
}
