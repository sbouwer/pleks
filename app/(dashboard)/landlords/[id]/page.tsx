import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ChevronLeft } from "lucide-react"
import { LandlordDetail } from "./LandlordDetail"

interface Props {
  params: Promise<{ id: string }>
}

export default async function LandlordDetailPage({ params }: Props) {
  const { id } = await params

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

  // Fetch landlord from view
  const { data: landlord } = await service
    .from("landlord_view")
    .select("id, contact_id, entity_type, first_name, last_name, company_name, trading_as, registration_number, vat_number, email, phone, bank_name, bank_account, bank_branch, bank_account_type, tax_number, payment_method, notes")
    .eq("id", id)
    .eq("org_id", membership.org_id)
    .single()

  if (!landlord) redirect("/landlords")

  // Fetch contact phones
  const { data: phones } = await service
    .from("contact_phones")
    .select("id, number, phone_type, label, is_primary, can_whatsapp")
    .eq("contact_id", landlord.contact_id)
    .order("is_primary", { ascending: false })

  // Fetch contact emails
  const { data: emails } = await service
    .from("contact_emails")
    .select("id, email, email_type, label, is_primary")
    .eq("contact_id", landlord.contact_id)
    .order("is_primary", { ascending: false })

  // Fetch contact addresses
  const { data: addresses } = await service
    .from("contact_addresses")
    .select("id, street_line1, street_line2, suburb, city, province, postal_code, address_type, is_primary")
    .eq("contact_id", landlord.contact_id)
    .order("is_primary", { ascending: false })

  // Fetch linked properties
  const { data: properties } = await service
    .from("properties")
    .select("id, name, unit_count")
    .eq("landlord_id", id)
    .eq("org_id", membership.org_id)
    .is("deleted_at", null)
    .order("name")

  const displayName = landlord.company_name ||
    `${landlord.first_name ?? ""} ${landlord.last_name ?? ""}`.trim() ||
    "Unnamed Landlord"

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <Button
          variant="ghost"
          size="sm"
          render={<Link href="/landlords" />}
          className="text-muted-foreground"
        >
          <ChevronLeft className="size-4" />
          Landlords
        </Button>
      </div>

      <div className="mb-6">
        <h1 className="font-heading text-3xl">{displayName}</h1>
        {landlord.company_name && (landlord.first_name || landlord.last_name) && (
          <p className="text-sm text-muted-foreground mt-1">
            {`${landlord.first_name ?? ""} ${landlord.last_name ?? ""}`.trim()}
          </p>
        )}
      </div>

      <LandlordDetail
        landlord={landlord}
        phones={phones ?? []}
        emails={emails ?? []}
        addresses={addresses ?? []}
        properties={properties ?? []}
        userRole={membership.role}
      />
    </div>
  )
}
