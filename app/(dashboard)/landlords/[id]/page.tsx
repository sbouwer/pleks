import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Building2 } from "lucide-react"
import { ContactDetailLayout } from "@/components/contacts/ContactDetailLayout"
import { ContactSidebar } from "@/components/contacts/ContactSidebar"
import { QuickActions } from "@/components/contacts/QuickActions"
import { SectionCard } from "@/components/contacts/SectionCard"
import { RelationshipCard } from "@/components/contacts/RelationshipCard"
import { StatGrid } from "@/components/contacts/StatGrid"
import { ActivityTimeline } from "@/components/contacts/ActivityTimeline"
import { LandlordIdentitySection, LandlordContactSection, LandlordAddressSection, LandlordBankingSection } from "./LandlordSections"
import { formatZAR } from "@/lib/constants"

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

  const { data: landlord } = await service
    .from("landlord_view")
    .select("id, contact_id, entity_type, first_name, last_name, company_name, trading_as, registration_number, vat_number, email, phone, bank_name, bank_account, bank_branch, bank_account_type, tax_number, payment_method, notes")
    .eq("id", id)
    .eq("org_id", membership.org_id)
    .single()

  if (!landlord) redirect("/landlords")

  const [phonesResult, emailsResult, addressesResult, propertiesResult] = await Promise.all([
    service
      .from("contact_phones")
      .select("id, number, phone_type, label, is_primary, can_whatsapp")
      .eq("contact_id", landlord.contact_id)
      .order("is_primary", { ascending: false }),
    service
      .from("contact_emails")
      .select("id, email, email_type, label, is_primary")
      .eq("contact_id", landlord.contact_id)
      .order("is_primary", { ascending: false }),
    service
      .from("contact_addresses")
      .select("id, street_line1, street_line2, suburb, city, province, postal_code, address_type, is_primary")
      .eq("contact_id", landlord.contact_id)
      .order("is_primary", { ascending: false }),
    service
      .from("properties")
      .select("id, name, address_line1, suburb, city, unit_count")
      .eq("landlord_id", id)
      .eq("org_id", membership.org_id)
      .is("deleted_at", null)
      .order("name"),
  ])

  const phones = phonesResult.data
  const emails = emailsResult.data
  const addresses = addressesResult.data
  const properties = propertiesResult.data

  // Leases for rent aggregation
  const { data: landlordLeases } = await service
    .from("leases")
    .select("rent_amount_cents, property_id")
    .in("property_id", (properties || []).map((p) => p.id))
    .in("status", ["active", "notice", "month_to_month"])
    .is("deleted_at", null)

  // Owner statements (table may not exist)
  let recentStatements: Array<{ id: string; period_month: string; net_to_owner_cents: number; owner_payment_status: string; owner_payment_date: string | null }> = []
  try {
    const { data } = await service
      .from("owner_statements")
      .select("id, period_month, net_to_owner_cents, owner_payment_status, owner_payment_date")
      .eq("landlord_id", id)
      .eq("org_id", membership.org_id)
      .order("period_month", { ascending: false })
      .limit(3)
    recentStatements = data ?? []
  } catch { recentStatements = [] }

  // Arrears
  let totalArrears = 0
  try {
    const { data: arrearsData } = await service
      .from("arrears_cases")
      .select("total_arrears_cents")
      .in("property_id", (properties || []).map((p) => p.id))
      .in("status", ["open", "payment_arrangement", "legal"])
    totalArrears = (arrearsData || []).reduce((sum, a) => sum + (a.total_arrears_cents || 0), 0)
  } catch { totalArrears = 0 }

  // Aggregates
  const rentByProperty: Record<string, number> = {}
  for (const lease of landlordLeases || []) {
    rentByProperty[lease.property_id] = (rentByProperty[lease.property_id] || 0) + (lease.rent_amount_cents || 0)
  }
  const totalMonthlyRent = Object.values(rentByProperty).reduce((sum, v) => sum + v, 0)
  const totalUnits = (properties || []).reduce((sum, p) => sum + (p.unit_count || 0), 0)
  const occupiedUnits = (landlordLeases || []).length
  const occupancyPercent = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0

  const initials = (displayName: string) =>
    displayName.split(" ").map((w: string) => w[0]).filter(Boolean).join("").slice(0, 2).toUpperCase()

  const displayName =
    landlord.company_name ||
    `${landlord.first_name ?? ""} ${landlord.last_name ?? ""}`.trim() ||
    "Unnamed Landlord"

  const primaryPhone = phones?.[0]?.number ?? null
  const primaryEmail = emails?.[0]?.email ?? null

  return (
    <ContactDetailLayout
      breadcrumb={{ label: "Landlords", href: "/landlords" }}
      sidebar={
        <ContactSidebar
          avatar={{ initials: initials(displayName), bgColor: "#E1F5EE", textColor: "#0F6E56" }}
          name={displayName}
          subtitle={landlord.entity_type === "organisation" ? "Company" : "Individual landlord"}
          badges={[
            { text: `${(properties || []).length} ${(properties || []).length === 1 ? "property" : "properties"}`, variant: "blue" as const },
            { text: "Active", variant: "green" as const },
          ]}
          quickActions={
            <QuickActions
              primaryPhone={primaryPhone}
              primaryEmail={primaryEmail}
              moreItems={[
                { label: "Send statement" },
                { label: "Archive", variant: "danger" as const },
              ]}
            />
          }
        >
          <LandlordIdentitySection
            landlordId={id}
            contactId={landlord.contact_id}
            entityType={landlord.entity_type}
            firstName={landlord.first_name}
            lastName={landlord.last_name}
            companyName={landlord.company_name}
            tradingAs={landlord.trading_as}
            registrationNumber={landlord.registration_number}
            vatNumber={landlord.vat_number}
            notes={landlord.notes}
          />
          <LandlordContactSection
            entityId={id}
            phones={phones ?? []}
            emails={emails ?? []}
          />
          <LandlordAddressSection
            entityId={id}
            address={(addresses ?? [])[0] ?? null}
          />
          <LandlordBankingSection
            landlordId={id}
            contactId={landlord.contact_id}
            bankName={landlord.bank_name}
            bankAccount={landlord.bank_account}
            bankBranch={landlord.bank_branch}
            bankAccountType={landlord.bank_account_type}
            taxNumber={landlord.tax_number}
            paymentMethod={landlord.payment_method}
          />
        </ContactSidebar>
      }
    >
      <SectionCard title="Properties" count={(properties || []).length} action={{ label: "View all", href: "/properties" }}>
        {(properties || []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No properties linked.</p>
        ) : (
          <div className="space-y-1">
            {(properties || []).map((p) => {
              const addressParts = [p.address_line1, p.suburb, p.city].filter(Boolean)
              return (
                <RelationshipCard
                  key={p.id}
                  icon={<Building2 className="h-4 w-4 text-blue-600" />}
                  iconBg="#E6F1FB"
                  title={p.name}
                  subtitle={addressParts.join(", ") || `${p.unit_count ?? 0} unit${p.unit_count === 1 ? "" : "s"}`}
                  rightLabel={rentByProperty[p.id] ? formatZAR(rentByProperty[p.id]) : undefined}
                  rightSublabel={rentByProperty[p.id] ? "/month" : undefined}
                  href={`/properties/${p.id}`}
                />
              )
            })}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Financial summary">
        <StatGrid stats={[
          { label: "Monthly rent", value: formatZAR(totalMonthlyRent) },
          { label: "Total units", value: String(totalUnits) },
          { label: "Occupancy", value: `${occupancyPercent}%` },
          { label: "Outstanding", value: formatZAR(totalArrears), variant: totalArrears > 0 ? "red" as const : "green" as const },
        ]} />
      </SectionCard>

      <SectionCard title="Owner statements" count={recentStatements.length}>
        <ActivityTimeline
          items={recentStatements.map((s) => ({
            dotColor: s.owner_payment_status === "paid" ? "#1D9E75" : "#D85A30",
            title: `${s.period_month} — ${formatZAR(s.net_to_owner_cents)} ${s.owner_payment_status}`,
            time: s.owner_payment_date ? new Date(s.owner_payment_date).toLocaleDateString("en-ZA") : "Pending",
          }))}
        />
      </SectionCard>
    </ContactDetailLayout>
  )
}
