/**
 * app/(dashboard)/landlords/[id]/page.tsx — Landlord detail page
 *
 * Route:  /landlords/[id]
 * Auth:   createClient() for auth.getUser(); createServiceClient() for all data queries
 * Data:   landlord_view, contact_phones/emails/addresses, properties, leases, owner_statements,
 *         arrears_cases, subscriptions, property_intelligence_pulls
 * Notes:  ADDENDUM_14A: LandlordVerificationCard added for Steward+ tiers (juristic + natural person branches).
 */
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { Building2 } from "lucide-react"
import { DetailPageLayout, DetailFullWidth } from "@/components/detail/DetailPageLayout"
import { DetailSection } from "@/components/detail/DetailSection"
import { DetailQuickbar } from "@/components/detail/DetailQuickbar"
import { contactActions } from "@/lib/detail/contactActions"
import type { DetailFact, DetailStatus, DetailAction } from "@/lib/detail/types"
import { SectionCard } from "@/components/contacts/SectionCard"
import { CompanyPeopleSection } from "@/components/contacts/CompanyPeopleSection"
import { fetchCompanyPeople } from "@/lib/contacts/companyPeople"
import { RelationshipCard } from "@/components/contacts/RelationshipCard"
import { StatGrid } from "@/components/contacts/StatGrid"
import { ActivityTimeline } from "@/components/contacts/ActivityTimeline"
import { LandlordIdentitySection, LandlordContactSection, LandlordAddressSection, LandlordBankingSection } from "./LandlordSections"
import { BankAccountsSection } from "@/components/contacts/edit/BankAccountsSection"
import { LandlordPortalSection } from "@/components/portal/LandlordPortalSection"
import { WelcomePackBanner } from "@/components/reports/WelcomePackBanner"
import { IdentityForkBanner } from "@/components/identity/IdentityForkBanner"
import { getIdentityForkState } from "@/lib/auth/server"
import { LandlordVerificationCard, type LinkedDeedsPull } from "./LandlordVerificationCard"
import type { LatestPull } from "../../properties/[id]/PropertyVerificationCard"
import { hasFeature } from "@/lib/tier/gates"
import type { Tier } from "@/lib/constants"
import { formatZAR } from "@/lib/constants"
import { SA_TIMEZONE } from "@/lib/dates"

interface Props {
  params: Promise<{ id: string }>
}

// Extracted to keep page function complexity within limits
async function fetchLandlordVerification(
  service: Awaited<ReturnType<typeof createServiceClient>>,
  orgId:      string,
  contactId:  string,
  entityType: string | null,
  propertyIds: string[],
  propertiesMap: Record<string, string>,
): Promise<{ latestCipcCompany: LatestPull | null; linkedDeedsPulls: LinkedDeedsPull[] }> {
  if (entityType === "organisation") {
    const { data, error } = await service
      .from("property_intelligence_pulls")
      .select("id, product_type, status, completed_at, extracted_facts_jsonb, subject_label, pdf_storage_path")
      .eq("org_id", orgId)
      .eq("product_type", "cipc_company")
      .eq("landlord_id", contactId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) console.error("cipc_company pull fetch failed:", error.message)
    return { latestCipcCompany: (data as LatestPull | null) ?? null, linkedDeedsPulls: [] }
  }

  if (propertyIds.length === 0) {
    return { latestCipcCompany: null, linkedDeedsPulls: [] }
  }

  const { data: deedsPulls, error } = await service
    .from("property_intelligence_pulls")
    .select("id, property_id, status, completed_at, extracted_facts_jsonb")
    .eq("org_id", orgId)
    .eq("product_type", "deeds_search")
    .in("property_id", propertyIds)
    .order("created_at", { ascending: false })
  if (error) {
    console.error("deeds pull fetch failed:", error.message)
    return { latestCipcCompany: null, linkedDeedsPulls: [] }
  }

  const seen = new Set<string>()
  const linkedDeedsPulls = (deedsPulls ?? []).reduce<LinkedDeedsPull[]>((acc, pull) => {
    if (!pull.property_id || seen.has(pull.property_id)) return acc
    seen.add(pull.property_id)
    const facts = pull.extracted_facts_jsonb as Record<string, unknown> | null
    acc.push({
      propertyId:   pull.property_id,
      propertyName: propertiesMap[pull.property_id] ?? pull.property_id,
      status:       pull.status as string,
      completedAt:  pull.completed_at as string | null,
      ownerName:    (facts?.owner_name as string) ?? null,
    })
    return acc
  }, [])

  return { latestCipcCompany: null, linkedDeedsPulls }
}

function buildLandlordFacts(
  entityType: string | null, propertyCount: number, totalMonthlyRent: number, occupancyPercent: number, totalArrears: number,
): DetailFact[] {
  const facts: DetailFact[] = [
    { k: "Type", v: entityType === "organisation" ? "Company" : "Individual" },
    { k: "Properties", v: String(propertyCount) },
    { k: "Monthly rent", v: formatZAR(totalMonthlyRent), mono: true },
    { k: "Occupancy", v: `${occupancyPercent}%` },
  ]
  if (totalArrears > 0) facts.push({ k: "Outstanding", v: formatZAR(totalArrears), mono: true })
  return facts
}

export default async function LandlordDetailPage({ params }: Props) {
  const { id } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  const service = await createServiceClient()

  // Identity-fork banner (ADDENDUM_01C §6): shown only on the landlord record that WAS this
  // agent's self-managed identity (forkedLandlordId === id), once, until dismissed.
  const forkState = await getIdentityForkState()

  const { data: membership, error: membershipError } = await service
    .from("user_orgs")
    .select("org_id, role")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single()
  if (membershipError) console.error("LandlordDetailPage user_orgs read failed:", membershipError.message)

  if (!membership) redirect("/onboarding")

  const { data: landlord, error: landlordError } = await service
    .from("landlord_view")
    .select("id, contact_id, entity_type, first_name, last_name, company_name, trading_as, registration_number, vat_number, email, phone, tax_number, payment_method, notes")
    .eq("id", id)
    .eq("org_id", membership.org_id)
    .single()
  if (landlordError) console.error("LandlordDetailPage landlord_view read failed:", landlordError.message)

  if (!landlord) redirect("/landlords")

  // Bank accounts — global multi-account banking (contact-scoped)
  const { data: landlordBankAccounts, error: landlordBankAccountsError } = await service
    .from("contact_bank_accounts")
    .select("id, account_name, bank_name, account_number, branch_code, account_type, label, is_primary")
    .eq("contact_id", landlord.contact_id)
    .eq("org_id", membership.org_id)
    .order("is_primary", { ascending: false })
  if (landlordBankAccountsError) console.error("LandlordDetailPage contact_bank_accounts read failed:", landlordBankAccountsError.message)

  // Identity extras not on landlord_view (title/gender shown on the identity card)
  const { data: identityExtra, error: identityExtraError } = await service
    .from("contacts")
    .select("title, gender")
    .eq("id", landlord.contact_id)
    .eq("org_id", membership.org_id)
    .single()
  if (identityExtraError) console.error("LandlordDetailPage contacts read failed:", identityExtraError.message)

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
      .select("id, street_line1, street_line2, suburb, city, province, postal_code, country, address_type, is_primary")
      .eq("contact_id", landlord.contact_id)
      .order("is_primary", { ascending: false }),
    service
      .from("properties")
      .select("id, name, address_line1, suburb, city, units(count)")
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
  const { data: landlordLeases, error: landlordLeasesError } = await service
    .from("leases")
    .select("rent_amount_cents, property_id")
    .in("property_id", (properties || []).map((p) => p.id))
    .in("status", ["active", "notice", "month_to_month"])
    .is("deleted_at", null)
  if (landlordLeasesError) console.error("LandlordDetailPage leases read failed:", landlordLeasesError.message)

  // Owner statements (table may not exist)
  let recentStatements: Array<{ id: string; period_month: string; net_to_owner_cents: number; owner_payment_status: string; owner_payment_date: string | null }> = []
  try {
    const { data, error: ownerStatementsError } = await service
      .from("owner_statements")
      .select("id, period_month, net_to_owner_cents, owner_payment_status, owner_payment_date")
      .eq("landlord_id", id)
      .eq("org_id", membership.org_id)
      .order("period_month", { ascending: false })
      .limit(3)
    if (ownerStatementsError) console.error("LandlordDetailPage owner_statements read failed:", ownerStatementsError.message)
    recentStatements = data ?? []
  } catch { recentStatements = [] }

  // Arrears
  let totalArrears = 0
  try {
    const { data: arrearsData, error: arrearsError } = await service
      .from("arrears_cases")
      .select("total_arrears_cents")
      .in("property_id", (properties || []).map((p) => p.id))
      .in("status", ["open", "payment_arrangement", "legal"])
    if (arrearsError) console.error("LandlordDetailPage arrears_cases read failed:", arrearsError.message)
    totalArrears = (arrearsData || []).reduce((sum, a) => sum + (a.total_arrears_cents || 0), 0)
  } catch { totalArrears = 0 }

  // Aggregates
  const rentByProperty: Record<string, number> = {}
  for (const lease of landlordLeases || []) {
    rentByProperty[lease.property_id] = (rentByProperty[lease.property_id] || 0) + (lease.rent_amount_cents || 0)
  }
  const totalMonthlyRent = Object.values(rentByProperty).reduce((sum, v) => sum + v, 0)
  const unitCountOf = (p: { units?: unknown }) => (p.units as { count: number }[] | null)?.[0]?.count ?? 0
  const totalUnits = (properties || []).reduce((sum, p) => sum + unitCountOf(p), 0)
  const occupiedUnits = (landlordLeases || []).length
  const occupancyPercent = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0

  const displayName =
    landlord.company_name ||
    `${landlord.first_name ?? ""} ${landlord.last_name ?? ""}`.trim() ||
    "Unnamed Landlord"

  const primaryPhone = phones?.[0]?.number ?? null
  const primaryEmail = emails?.[0]?.email ?? null

  // 25A: people under a company landlord (signatories, accounts, maintenance…). Empty for individuals.
  const companyPeople = landlord.entity_type === "organisation"
    ? await fetchCompanyPeople(service, membership.org_id, landlord.contact_id)
    : []

  // Landlord portal status + org tier for portal gating
  const { data: landlordPortal, error: landlordPortalError } = await service
    .from("landlords")
    .select("portal_status, portal_invited_at")
    .eq("id", id)
    .single()
  if (landlordPortalError) console.error("LandlordDetailPage landlords portal read failed:", landlordPortalError.message)
  const { data: sub, error: subError } = await service
    .from("subscriptions")
    .select("tier")
    .eq("org_id", membership.org_id)
    .not("status", "eq", "purged")
    .order("created_at", { ascending: false })
    .limit(1)            // an org can have >1 subscription row over time — take the latest, never throw on .single()
    .maybeSingle()
  if (subError) console.error("LandlordDetailPage subscriptions read failed:", subError.message)
  const orgTier = sub?.tier ?? "steward"
  const canAccessIntelligence = hasFeature((orgTier ?? "owner") as Tier, "property_intelligence")

  // Property Intelligence — fetch verification pulls for this landlord
  const propertiesMap = Object.fromEntries((properties ?? []).map((p) => [p.id, p.name]))
  const { latestCipcCompany, linkedDeedsPulls } = canAccessIntelligence
    ? await fetchLandlordVerification(
        service,
        membership.org_id,
        landlord.contact_id,
        landlord.entity_type,
        (properties ?? []).map((p) => p.id),
        propertiesMap,
      )
    : { latestCipcCompany: null as LatestPull | null, linkedDeedsPulls: [] as LinkedDeedsPull[] }

  const propertyCount = (properties || []).length

  const status: DetailStatus = { kind: "occupied", label: "Active" }
  const facts = buildLandlordFacts(landlord.entity_type, propertyCount, totalMonthlyRent, occupancyPercent, totalArrears)

  // Quick-action toolbar — call/email/whatsapp + the welcome-pack generator (the live sidebar actions).
  const actions: DetailAction[] = [
    ...contactActions(primaryPhone, primaryEmail),
    { key: "welcome", label: "Welcome pack", icon: "welcome", href: `/api/reports/welcome-pack?orgId=${membership.org_id}&landlordId=${id}` },
  ]

  return (
    <DetailPageLayout
      category="Landlords"
      backHref="/landlords"
      title={displayName}
      status={status}
      facts={facts}
      actions={<DetailQuickbar actions={actions} />}
    >
      {forkState?.forked && !forkState.dismissedLandlord && forkState.forkedLandlordId === id && (
        <DetailFullWidth><IdentityForkBanner surface="landlord" /></DetailFullWidth>
      )}
      <DetailFullWidth>
        <WelcomePackBanner orgId={membership.org_id} landlordId={id} landlordName={displayName} />
      </DetailFullWidth>

      {landlord.entity_type === "organisation" && (
        <DetailFullWidth>
          <CompanyPeopleSection people={companyPeople} companyContactId={landlord.contact_id} fica />
        </DetailFullWidth>
      )}

      {/* Former sidebar sections — now grid body blocks. */}
      <DetailSection>
        <LandlordIdentitySection
          landlordId={id}
          contactId={landlord.contact_id}
          entityType={landlord.entity_type}
          title={identityExtra?.title ?? null}
          gender={identityExtra?.gender ?? null}
          firstName={landlord.first_name}
          lastName={landlord.last_name}
          companyName={landlord.company_name}
          tradingAs={landlord.trading_as}
          registrationNumber={landlord.registration_number}
          vatNumber={landlord.vat_number}
          notes={landlord.notes}
        />
      </DetailSection>
      <DetailSection>
        <LandlordContactSection entityId={id} phones={phones ?? []} emails={emails ?? []} fallbackPhone={landlord.phone} fallbackEmail={landlord.email} />
      </DetailSection>
      <DetailSection>
        <LandlordAddressSection entityId={id} address={(addresses ?? [])[0] ?? null} />
      </DetailSection>
      <DetailSection>
        <BankAccountsSection
          entityType="landlords"
          entityId={id}
          contactId={landlord.contact_id}
          accounts={landlordBankAccounts ?? []}
        />
      </DetailSection>
      <DetailSection>
        <LandlordBankingSection
          landlordId={id}
          contactId={landlord.contact_id}
          taxNumber={landlord.tax_number}
          paymentMethod={landlord.payment_method}
        />
      </DetailSection>
      <DetailSection>
        <LandlordPortalSection
          landlordId={id}
          tier={orgTier}
          portalStatus={(landlordPortal?.portal_status ?? "none") as "none" | "invited" | "active" | "suspended"}
          portalInvitedAt={landlordPortal?.portal_invited_at ?? null}
          landlordEmail={primaryEmail}
        />
      </DetailSection>

      <DetailFullWidth>
        <SectionCard title="Properties" count={propertyCount} action={{ label: "View all", href: "/properties" }}>
          {propertyCount === 0 ? (
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
                    subtitle={addressParts.join(", ") || `${unitCountOf(p)} unit${unitCountOf(p) === 1 ? "" : "s"}`}
                    rightLabel={rentByProperty[p.id] ? formatZAR(rentByProperty[p.id]) : undefined}
                    rightSublabel={rentByProperty[p.id] ? "/month" : undefined}
                    href={`/properties/${p.id}`}
                  />
                )
              })}
            </div>
          )}
        </SectionCard>
      </DetailFullWidth>

      <DetailFullWidth>
        <SectionCard title="Financial summary" action={{ label: "View ledger", href: `/landlords/${id}/ledger` }}>
          <StatGrid stats={[
            { label: "Monthly rent", value: formatZAR(totalMonthlyRent) },
            { label: "Total units", value: String(totalUnits) },
            { label: "Occupancy", value: `${occupancyPercent}%` },
            { label: "Outstanding", value: formatZAR(totalArrears), variant: totalArrears > 0 ? "red" as const : "green" as const },
          ]} />
        </SectionCard>
      </DetailFullWidth>

      <DetailFullWidth>
        <LandlordVerificationCard
          landlordContactId={landlord.contact_id}
          entityType={landlord.entity_type}
          registrationNumber={landlord.registration_number ?? null}
          companyName={landlord.company_name ?? null}
          landlordDisplayName={displayName}
          canAccessIntelligence={canAccessIntelligence}
          latestCipcCompany={latestCipcCompany}
          linkedDeedsPulls={linkedDeedsPulls}
        />
      </DetailFullWidth>

      <DetailFullWidth>
        <SectionCard title="Owner statements" count={recentStatements.length}>
          <ActivityTimeline
            items={recentStatements.map((s) => ({
              dotColor: s.owner_payment_status === "paid" ? "#1D9E75" : "#D85A30",
              title: `${s.period_month} — ${formatZAR(s.net_to_owner_cents)} ${s.owner_payment_status}`,
              time: s.owner_payment_date ? new Date(s.owner_payment_date).toLocaleDateString("en-ZA", { timeZone: SA_TIMEZONE }) : "Pending",
            }))}
          />
        </SectionCard>
      </DetailFullWidth>
    </DetailPageLayout>
  )
}
