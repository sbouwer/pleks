import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Wrench } from "lucide-react"
import { ContactDetailLayout } from "@/components/contacts/ContactDetailLayout"
import { ContactSidebar } from "@/components/contacts/ContactSidebar"
import { QuickActions } from "@/components/contacts/QuickActions"
import { SectionCard } from "@/components/contacts/SectionCard"
import { RelationshipCard } from "@/components/contacts/RelationshipCard"
import { StatGrid } from "@/components/contacts/StatGrid"
import { ActivityTimeline } from "@/components/contacts/ActivityTimeline"
import { ContractorContactSection, ContractorRatesSection, ContractorBankingSection, ContractorAddressSection } from "./ContractorSections"
import { ContractorPortalSection } from "@/components/contractors/ContractorPortalSection"
import { formatZAR } from "@/lib/constants"

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
    .select("id, contact_id, entity_type, first_name, last_name, company_name, trading_as, registration_number, vat_number, email, phone, specialities, is_active, notes, call_out_rate_cents, hourly_rate_cents")
    .eq("id", id)
    .eq("org_id", membership.org_id)
    .single()

  if (!contractor) redirect("/contractors")

  // Fetch banking + portal info from contractors table
  const { data: contractorBanking } = await service
    .from("contractors")
    .select("banking_name, bank_name, bank_account_number, bank_branch_code, bank_account_type, vat_registered, portal_status, portal_invite_sent_at")
    .eq("id", id)
    .eq("org_id", membership.org_id)
    .single()

  // Fetch org tier for portal gating
  const { data: sub } = await service
    .from("subscriptions")
    .select("tier")
    .eq("org_id", membership.org_id)
    .single()
  const orgTier = sub?.tier ?? "steward"

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

  // Active maintenance jobs assigned to this contractor
  const { data: activeJobs } = await service
    .from("maintenance_requests")
    .select("id, title, category, status, urgency, created_at, quoted_cost_cents, units(unit_number, properties(name))")
    .eq("contractor_id", id)
    .not("status", "in", "(completed,closed,cancelled)")
    .order("created_at", { ascending: false })

  // Completed jobs for performance stats
  const { data: completedJobs } = await service
    .from("maintenance_requests")
    .select("id, created_at, completed_at, tenant_rating")
    .eq("contractor_id", id)
    .eq("status", "completed")

  // Recent invoices (may not exist)
  let recentInvoices: Array<{ id: string; invoice_number: string | null; amount_incl_vat_cents: number; status: string; invoice_date: string }> = []
  let totalInvoiced = 0
  try {
    const { data: invData } = await service
      .from("supplier_invoices")
      .select("id, invoice_number, amount_incl_vat_cents, status, invoice_date")
      .eq("contractor_id", id)
      .order("invoice_date", { ascending: false })
      .limit(5)
    recentInvoices = invData ?? []

    const { data: invTotal } = await service
      .from("supplier_invoices")
      .select("amount_incl_vat_cents")
      .eq("contractor_id", id)
      .eq("status", "paid")
    totalInvoiced = (invTotal ?? []).reduce((sum, i) => sum + (i.amount_incl_vat_cents || 0), 0)
  } catch { recentInvoices = []; totalInvoiced = 0 }

  // Performance stats
  const totalCompleted = completedJobs?.length ?? 0
  const avgCompletionDays = totalCompleted > 0
    ? Math.round(
        (completedJobs ?? []).reduce((sum, j) => {
          const days = j.completed_at && j.created_at
            ? (new Date(j.completed_at).getTime() - new Date(j.created_at).getTime()) / (1000 * 60 * 60 * 24)
            : 0
          return sum + days
        }, 0) / totalCompleted * 10
      ) / 10
    : 0

  const ratings = (completedJobs ?? []).filter((j) => j.tenant_rating != null).map((j) => j.tenant_rating as number)
  const avgRating = ratings.length > 0
    ? Math.round(ratings.reduce((a, b) => a + b, 0) / ratings.length * 10) / 10
    : null

  // Badges
  const badges: Array<{ text: string; variant: "green" | "amber" | "red" | "blue" | "gray" }> = [
    { text: contractor.is_active ? "Active" : "Inactive", variant: contractor.is_active ? "green" : "gray" },
  ]
  if (contractorBanking?.vat_registered) badges.push({ text: "VAT registered", variant: "gray" })

  const displayName = contractor.company_name ||
    `${contractor.first_name ?? ""} ${contractor.last_name ?? ""}`.trim() ||
    "Unnamed Contractor"
  const primaryPhone = phones?.[0]?.number ?? null
  const primaryEmail = emails?.[0]?.email ?? null
  const initials = (name: string) => name.split(" ").map((w: string) => w[0]).filter(Boolean).join("").slice(0, 2).toUpperCase()

  void contractorContacts

  return (
    <ContactDetailLayout breadcrumb={{ label: "Contractors", href: "/contractors" }} sidebar={
      <ContactSidebar
        avatar={{ initials: initials(displayName), bgColor: "#FFF7ED", textColor: "#C2410C" }}
        name={displayName}
        subtitle={contractor.entity_type === "organisation" ? "Company" : "Individual contractor"}
        badges={badges}
        quickActions={
          <QuickActions primaryPhone={primaryPhone} primaryEmail={primaryEmail} moreItems={[
            { label: "Archive", variant: "danger" as const },
          ]} />
        }
      >
        <ContractorContactSection entityId={id} phones={phones ?? []} emails={emails ?? []} />
        <ContractorRatesSection
          contractorId={id}
          callOutRateCents={contractor.call_out_rate_cents ?? null}
          hourlyRateCents={contractor.hourly_rate_cents ?? null}
          specialities={contractor.specialities ?? []}
        />
        <ContractorBankingSection
          contractorId={id}
          bankingName={contractorBanking?.banking_name ?? null}
          bankName={contractorBanking?.bank_name ?? null}
          bankAccountNumber={contractorBanking?.bank_account_number ?? null}
          bankBranchCode={contractorBanking?.bank_branch_code ?? null}
          bankAccountType={contractorBanking?.bank_account_type ?? null}
        />
        <ContractorAddressSection entityId={id} address={(addresses ?? [])[0] ?? null} />
        <ContractorPortalSection
          contractorId={id}
          tier={orgTier}
          portalStatus={(contractorBanking?.portal_status ?? "none") as "none" | "invited" | "active" | "suspended"}
          portalInviteSentAt={contractorBanking?.portal_invite_sent_at ?? null}
          contractorEmail={primaryEmail}
        />
      </ContactSidebar>
    }>

      {/* Active jobs */}
      <SectionCard title="Active jobs" count={(activeJobs ?? []).length}>
        {(activeJobs ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No active jobs.</p>
        ) : (
          <div className="space-y-1">
            {(activeJobs ?? []).map((job) => {
              const unit = job.units as unknown as { unit_number: string; properties: { name: string } } | null
              const statusVariant = ["in_progress", "acknowledged", "work_order_sent"].includes(job.status) ? "amber" as const : "blue" as const
              return (
                <RelationshipCard
                  key={job.id}
                  icon={<Wrench className="h-4 w-4 text-orange-600" />}
                  iconBg="#FFF7ED"
                  title={job.title}
                  subtitle={unit ? `${unit.properties?.name ?? ""} — ${unit.unit_number}` : job.category ?? ""}
                  rightLabel={job.quoted_cost_cents ? formatZAR(job.quoted_cost_cents) : undefined}
                  rightBadge={!job.quoted_cost_cents ? { text: job.status.replaceAll(/_/g, " "), variant: statusVariant } : undefined}
                  href={`/maintenance/${job.id}`}
                />
              )
            })}
          </div>
        )}
      </SectionCard>

      {/* Performance */}
      <SectionCard title="Performance">
        <StatGrid stats={[
          { label: "Jobs completed", value: String(totalCompleted) },
          { label: "Avg completion", value: totalCompleted > 0 ? `${avgCompletionDays} days` : "—" },
          { label: "Avg rating", value: avgRating != null ? `${avgRating}/5` : "—" },
          { label: "Total invoiced", value: formatZAR(totalInvoiced) },
        ]} />
      </SectionCard>

      {/* Recent invoices */}
      <SectionCard title="Recent invoices" count={recentInvoices.length}>
        <ActivityTimeline
          items={recentInvoices.map((inv) => ({
            dotColor: inv.status === "paid" ? "#1D9E75" : "#D85A30",
            title: `${inv.invoice_number ?? "Invoice"} — ${formatZAR(inv.amount_incl_vat_cents)} (${inv.status})`,
            time: new Date(inv.invoice_date).toLocaleDateString("en-ZA"),
          }))}
        />
      </SectionCard>
    </ContactDetailLayout>
  )
}
