import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ChevronLeft } from "lucide-react"
import { ContractorDetail } from "./ContractorDetail"

interface Props {
  params: Promise<{ id: string }>
}

export default async function ContractorDetailPage({ params }: Props) {
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

  // Fetch contractor from view
  const { data: contractor } = await service
    .from("contractor_view")
    .select("id, contact_id, first_name, last_name, company_name, trading_as, registration_number, vat_number, email, phone, specialities, is_active, notes, call_out_rate_cents, hourly_rate_cents")
    .eq("id", id)
    .eq("org_id", membership.org_id)
    .single()

  if (!contractor) redirect("/contractors")

  // Fetch banking info from contractors table
  const { data: contractorBanking } = await service
    .from("contractors")
    .select("banking_name, bank_name, bank_account_number, bank_branch_code, bank_account_type, vat_registered")
    .eq("id", id)
    .eq("org_id", membership.org_id)
    .single()

  // Fetch contact phones
  const { data: phones } = await service
    .from("contact_phones")
    .select("id, number, phone_type, label, is_primary, can_whatsapp")
    .eq("contact_id", contractor.contact_id)
    .order("is_primary", { ascending: false })

  // Fetch contact emails
  const { data: emails } = await service
    .from("contact_emails")
    .select("id, email, email_type, label, is_primary")
    .eq("contact_id", contractor.contact_id)
    .order("is_primary", { ascending: false })

  // Fetch contact addresses
  const { data: addresses } = await service
    .from("contact_addresses")
    .select("id, street_line1, street_line2, suburb, city, province, postal_code, address_type, is_primary")
    .eq("contact_id", contractor.contact_id)
    .order("is_primary", { ascending: false })

  // Fetch contractor contacts (associated people)
  const { data: contractorContacts } = await service
    .from("contractor_contacts")
    .select("id, contact_id, role, is_primary, contacts(first_name, last_name, company_name, primary_email, primary_phone)")
    .eq("contractor_id", id)
    .eq("org_id", membership.org_id)

  const displayName = contractor.company_name ||
    `${contractor.first_name ?? ""} ${contractor.last_name ?? ""}`.trim() ||
    "Unnamed Contractor"

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <Button
          variant="ghost"
          size="sm"
          render={<Link href="/contractors" />}
          className="text-muted-foreground"
        >
          <ChevronLeft className="size-4" />
          Contractors
        </Button>
      </div>

      <div className="mb-6">
        <h1 className="font-heading text-3xl">{displayName}</h1>
        {contractor.company_name && (contractor.first_name || contractor.last_name) && (
          <p className="text-sm text-muted-foreground mt-1">
            {`${contractor.first_name ?? ""} ${contractor.last_name ?? ""}`.trim()}
          </p>
        )}
      </div>

      <ContractorDetail
        contractor={{
          ...contractor,
          specialities: contractor.specialities ?? [],
          banking_name: contractorBanking?.banking_name ?? null,
          bank_name: contractorBanking?.bank_name ?? null,
          bank_account_number: contractorBanking?.bank_account_number ?? null,
          bank_branch_code: contractorBanking?.bank_branch_code ?? null,
          bank_account_type: contractorBanking?.bank_account_type ?? null,
          vat_registered: contractorBanking?.vat_registered ?? false,
        }}
        phones={phones ?? []}
        emails={emails ?? []}
        addresses={addresses ?? []}
        contractorContacts={(contractorContacts ?? []).map((cc) => ({
          id: cc.id,
          contact_id: cc.contact_id,
          role: cc.role,
          is_primary: cc.is_primary,
          contacts: Array.isArray(cc.contacts) ? cc.contacts[0] : cc.contacts,
        }))}
        userRole={membership.role}
        orgId={membership.org_id}
      />
    </div>
  )
}
