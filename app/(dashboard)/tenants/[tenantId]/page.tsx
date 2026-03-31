import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ChevronLeft } from "lucide-react"
import { TenantDetail } from "./TenantDetail"

export default async function TenantDetailPage({
  params,
}: Readonly<{
  params: Promise<{ tenantId: string }>
}>) {
  const { tenantId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const service = await createServiceClient()

  const { data: membership } = await service
    .from("user_orgs")
    .select("org_id, role")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single()

  if (!membership) redirect("/onboarding")

  const { data: tenant } = await service
    .from("tenant_view")
    .select("*")
    .eq("id", tenantId)
    .eq("org_id", membership.org_id)
    .is("deleted_at", null)
    .single()

  if (!tenant) notFound()

  const { data: phones } = await service
    .from("contact_phones")
    .select("id, number, phone_type, label, is_primary, can_whatsapp")
    .eq("contact_id", tenant.contact_id)
    .order("is_primary", { ascending: false })

  const { data: emails } = await service
    .from("contact_emails")
    .select("id, email, email_type, label, is_primary")
    .eq("contact_id", tenant.contact_id)
    .order("is_primary", { ascending: false })

  const { data: addresses } = await service
    .from("contact_addresses")
    .select("id, street_line1, street_line2, suburb, city, province, postal_code, address_type, is_primary")
    .eq("contact_id", tenant.contact_id)
    .order("is_primary", { ascending: false })

  const { data: history } = await service
    .from("tenancy_history")
    .select("id, move_in_date, move_out_date, status, units(unit_number, properties(name))")
    .eq("tenant_id", tenantId)
    .order("move_in_date", { ascending: false })

  const { data: comms } = await service
    .from("communication_log")
    .select("id, channel, direction, subject, body, status, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(20)

  const displayName = tenant.entity_type === "individual"
    ? `${tenant.first_name ?? ""} ${tenant.last_name ?? ""}`.trim() || "Unnamed Tenant"
    : tenant.company_name || "Unnamed Tenant"

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <Button
          variant="ghost"
          size="sm"
          render={<Link href="/tenants" />}
          className="text-muted-foreground"
        >
          <ChevronLeft className="size-4" />
          Tenants
        </Button>
      </div>

      <div className="mb-6">
        <h1 className="font-heading text-3xl">{displayName}</h1>
        {tenant.entity_type !== "individual" && (tenant.first_name || tenant.last_name) && (
          <p className="text-sm text-muted-foreground mt-1">
            {`${tenant.first_name ?? ""} ${tenant.last_name ?? ""}`.trim()}
          </p>
        )}
      </div>

      <TenantDetail
        tenant={{
          id: tenant.id,
          contact_id: tenant.contact_id,
          entity_type: tenant.entity_type,
          first_name: tenant.first_name ?? null,
          last_name: tenant.last_name ?? null,
          company_name: tenant.company_name ?? null,
          registration_number: tenant.registration_number ?? null,
          vat_number: tenant.vat_number ?? null,
          contact_person: tenant.contact_person ?? null,
          id_number: tenant.id_number ?? null,
          id_type: tenant.id_type ?? null,
          date_of_birth: tenant.date_of_birth ?? null,
          nationality: tenant.nationality ?? null,
          email: tenant.email ?? null,
          phone: tenant.phone ?? null,
          employer_name: tenant.employer_name ?? null,
          employer_phone: tenant.employer_phone ?? null,
          occupation: tenant.occupation ?? null,
          employment_type: tenant.employment_type ?? null,
          preferred_contact: tenant.preferred_contact ?? null,
          blacklisted: tenant.blacklisted ?? false,
          notes: tenant.notes ?? null,
        }}
        phones={phones ?? []}
        emails={emails ?? []}
        addresses={addresses ?? []}
        history={(history ?? []) as unknown as Array<{
          id: string
          move_in_date: string
          move_out_date: string | null
          status: string
          units: { unit_number: string; properties: { name: string } } | null
        }>}
        comms={comms ?? []}
        userRole={membership.role}
      />
    </div>
  )
}
