/**
 * app/(dashboard)/tenants/[tenantId]/page.tsx — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect, notFound } from "next/navigation"
import { Home, Wrench } from "lucide-react"
import { DetailPageLayout, DetailFullWidth } from "@/components/detail/DetailPageLayout"
import { DetailSection } from "@/components/detail/DetailSection"
import { DetailQuickbar } from "@/components/detail/DetailQuickbar"
import { contactActions } from "@/lib/detail/contactActions"
import type { DetailFact, DetailStatus } from "@/lib/detail/types"
import { SectionCard } from "@/components/contacts/SectionCard"
import { RelationshipCard } from "@/components/contacts/RelationshipCard"
import { StatGrid } from "@/components/contacts/StatGrid"
import { TenantContactSection, TenantIdentitySection, TenantEmploymentSection, TenantAddressSection, TenantJuristicSection } from "./TenantSections"
import { MobileTenantView } from "@/components/mobile/MobileTenantView"
import { formatZAR } from "@/lib/constants"
import { logQueryError } from "@/lib/supabase/logQueryError"

// ─── Types ────────────────────────────────────────────────────────────────────

interface TenantRow {
  entity_type: string
  first_name: string | null
  last_name: string | null
  company_name: string | null
  blacklisted: boolean | null
}

interface ArrearsCase {
  total_arrears_cents: number
  months_in_arrears: number
  status: string
}

interface LeaseRow {
  id: string
  rent_amount_cents: number | null
  deposit_amount_cents: number | null
  start_date: string | null
  end_date: string | null
  status: string
}

interface LeaseUnit {
  id: string
  unit_number: string
  bedrooms: number | null
  bathrooms: number | null
  properties: { id: string; name: string; suburb: string | null; city: string | null }
}

interface MaintenanceUnit {
  unit_number: string
  properties: { name: string }
}

// ─── Module-level helpers ─────────────────────────────────────────────────────

function getDisplayName(tenant: TenantRow): string {
  if (tenant.entity_type === "individual") {
    return `${tenant.first_name ?? ""} ${tenant.last_name ?? ""}`.trim() || "Unnamed Tenant"
  }
  return tenant.company_name || "Unnamed Tenant"
}

function tenantStatus(tenant: TenantRow, activeLease: LeaseRow | null, arrearsCase: ArrearsCase | null): DetailStatus {
  if (tenant.blacklisted) return { kind: "flag", label: "Blacklisted" }
  if (arrearsCase) return { kind: "flag", label: `${arrearsCase.months_in_arrears}mo arrears` }
  if (activeLease?.status === "notice") return { kind: "vacant", label: "Notice period" }
  if (activeLease) return { kind: "occupied", label: "Active lease" }
  return { kind: "neutral", label: "No active lease" }
}

function buildTenantFacts(tenant: TenantRow, activeLease: LeaseRow | null, arrearsCase: ArrearsCase | null): DetailFact[] {
  const facts: DetailFact[] = [
    { k: "Type", v: tenant.entity_type === "individual" ? "Individual" : "Company" },
    { k: "Rent", v: activeLease ? formatZAR(activeLease.rent_amount_cents ?? 0) : "—", mono: true },
    { k: "Deposit", v: activeLease?.deposit_amount_cents ? formatZAR(activeLease.deposit_amount_cents) : "—", mono: true },
  ]
  if (arrearsCase) facts.push({ k: "Arrears", v: formatZAR(arrearsCase.total_arrears_cents), mono: true })
  return facts
}

function getLeaseSubtitle(leaseUnit: LeaseUnit, endDate: string | null): string {
  const parts: string[] = []
  if (leaseUnit.bedrooms != null) parts.push(`${leaseUnit.bedrooms} bed`)
  parts.push(endDate ? `Until ${new Date(endDate).toLocaleDateString("en-ZA")}` : "Month-to-month")
  return parts.join(" · ")
}

function getMaintenanceStatusVariant(status: string): "amber" | "blue" {
  return ["in_progress", "work_order_sent", "acknowledged"].includes(status) ? "amber" : "blue"
}

// ─── Page ─────────────────────────────────────────────────────────────────────

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

  const { data: membership, error: membershipError } = await service
    .from("user_orgs")
    .select("org_id, role")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single()
    logQueryError("TenantDetailPage user_orgs", membershipError)

  if (!membership) redirect("/onboarding")

  const { data: tenant, error: tenantError } = await service
    .from("tenant_view")
    .select("*")
    .eq("id", tenantId)
    .eq("org_id", membership.org_id)
    .is("deleted_at", null)
    .single()
    logQueryError("TenantDetailPage tenant_view", tenantError)

  if (!tenant) notFound()

  // Identity extras (title/gender) not on tenant_view — shown on the identity card
  const { data: tenantIdentityExtra, error: tenantIdentityExtraError } = await service
    .from("contacts")
    .select("title, gender")
    .eq("id", tenant.contact_id)
    .eq("org_id", membership.org_id)
    .single()
    logQueryError("TenantDetailPage contacts", tenantIdentityExtraError)

  const [
    { data: phones },
    { data: emails },
    { data: addresses },
    { data: activeLease },
    { data: maintenanceRequests },
  ] = await Promise.all([
    service
      .from("contact_phones")
      .select("id, number, phone_type, label, is_primary, can_whatsapp")
      .eq("contact_id", tenant.contact_id)
      .order("is_primary", { ascending: false }),
    service
      .from("contact_emails")
      .select("id, email, email_type, label, is_primary")
      .eq("contact_id", tenant.contact_id)
      .order("is_primary", { ascending: false }),
    service
      .from("contact_addresses")
      .select("id, street_line1, street_line2, suburb, city, province, postal_code, country, address_type, is_primary")
      .eq("contact_id", tenant.contact_id)
      .order("is_primary", { ascending: false }),
    service
      .from("leases")
      .select("id, rent_amount_cents, start_date, end_date, status, deposit_amount_cents, units(id, unit_number, bedrooms, bathrooms, properties(id, name, suburb, city))")
      .eq("tenant_id", tenantId)
      .in("status", ["active", "notice", "month_to_month"])
      .is("deleted_at", null)
      .order("start_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    service
      .from("maintenance_requests")
      .select("id, title, category, urgency, status, created_at, units(unit_number, properties(name))")
      .eq("tenant_id", tenantId)
      .not("status", "in", "(completed,closed,cancelled)")
      .order("created_at", { ascending: false })
      .limit(5),
  ])

  let arrearsCase: ArrearsCase | null = null
  try {
    const { data, error: queryError } = await service
      .from("arrears_cases")
      .select("total_arrears_cents, interest_accrued_cents, status, months_in_arrears")
      .eq("tenant_id", tenantId)
      .in("status", ["open", "payment_arrangement", "legal"])
      .limit(1)
      .maybeSingle()
    logQueryError("TenantDetailPage arrears_cases", queryError)
    arrearsCase = data
  } catch {
    arrearsCase = null
  }

  const displayName = getDisplayName(tenant)
  const primaryPhone = phones?.[0]?.number ?? null
  const primaryEmail = emails?.[0]?.email ?? null

  const status = tenantStatus(tenant, activeLease ?? null, arrearsCase)
  const facts = buildTenantFacts(tenant, activeLease ?? null, arrearsCase)
  const actions = contactActions(primaryPhone, primaryEmail)
  const leaseUnit = activeLease?.units as unknown as LeaseUnit | null
  const leaseProperty = leaseUnit?.properties ?? null

  const mobileLease = activeLease && leaseUnit ? {
    id: activeLease.id,
    rentAmountCents: activeLease.rent_amount_cents ?? 0,
    depositAmountCents: activeLease.deposit_amount_cents ?? null,
    startDate: activeLease.start_date,
    endDate: activeLease.end_date,
    status: activeLease.status,
    unitNumber: leaseUnit.unit_number,
    propertyName: leaseProperty?.name ?? "",
  } : null

  return (
    <div>
      {/* Mobile view */}
      <div className="lg:hidden">
        <MobileTenantView
          tenantId={tenantId}
          displayName={displayName}
          entityType={tenant.entity_type}
          primaryPhone={primaryPhone}
          primaryEmail={primaryEmail}
          activeLease={mobileLease}
          arrearsAmountCents={arrearsCase?.total_arrears_cents ?? null}
          activeMaintenanceRequests={(maintenanceRequests ?? []).map((r) => ({
            id: r.id,
            title: r.title,
            status: r.status,
            urgency: r.urgency ?? null,
          }))}
        />
      </div>

      {/* Desktop view */}
      <div className="hidden lg:block">
    <DetailPageLayout
      category="Tenants"
      backHref="/tenants"
      title={displayName}
      status={status}
      facts={facts}
      actions={<DetailQuickbar actions={actions} />}
    >
      <DetailSection>
        <TenantContactSection entityId={tenantId} phones={phones ?? []} emails={emails ?? []} fallbackPhone={tenant.phone ?? null} fallbackEmail={tenant.email ?? null} />
      </DetailSection>
      <DetailSection>
        <TenantIdentitySection
          title={tenantIdentityExtra?.title ?? null}
          gender={tenantIdentityExtra?.gender ?? null}
          idNumber={tenant.id_number ?? null}
          idType={tenant.id_type ?? null}
          dateOfBirth={tenant.date_of_birth ?? null}
          nationality={tenant.nationality ?? null}
        />
      </DetailSection>
      {tenant.entity_type === "individual" && (
        <DetailSection>
          <TenantEmploymentSection
            tenantId={tenantId}
            employerName={tenant.employer_name ?? null}
            employerPhone={tenant.employer_phone ?? null}
            occupation={tenant.occupation ?? null}
            employmentType={tenant.employment_type ?? null}
            preferredContact={tenant.preferred_contact ?? null}
          />
        </DetailSection>
      )}
      {tenant.entity_type !== "individual" && (
        <DetailSection>
          <TenantJuristicSection
            contactId={tenant.contact_id}
            juristicType={(tenant as Record<string, unknown>).juristic_type as string | null ?? null}
            turnoverUnder2m={(tenant as Record<string, unknown>).turnover_under_2m as boolean | null ?? null}
            assetValueUnder2m={(tenant as Record<string, unknown>).asset_value_under_2m as boolean | null ?? null}
            sizeBandsCapturedAt={(tenant as Record<string, unknown>).size_bands_captured_at as string | null ?? null}
          />
        </DetailSection>
      )}
      <DetailSection>
        <TenantAddressSection entityId={tenantId} address={(addresses ?? [])[0] ?? null} />
      </DetailSection>

      <DetailFullWidth>
        <SectionCard title="Current lease">
          {activeLease && leaseUnit ? (
            <RelationshipCard
              icon={<Home className="h-4 w-4 text-indigo-600" />}
              iconBg="#EEF2FF"
              title={`${leaseProperty?.name ?? ""} — ${leaseUnit.unit_number}`}
              subtitle={getLeaseSubtitle(leaseUnit, activeLease.end_date)}
              rightLabel={formatZAR(activeLease.rent_amount_cents ?? 0)}
              rightSublabel="/month"
              href={`/leases/${activeLease.id}`}
            />
          ) : (
            <p className="text-sm text-muted-foreground">No active lease.</p>
          )}
        </SectionCard>
      </DetailFullWidth>

      <DetailFullWidth>
        <SectionCard title="Payment status" action={{ label: "View ledger & statement", href: "/tenants/" + tenantId + "/ledger" }}>
          <StatGrid
            stats={[
              { label: "Monthly rent", value: activeLease ? formatZAR(activeLease.rent_amount_cents ?? 0) : "—" },
              { label: "Deposit held", value: activeLease?.deposit_amount_cents ? formatZAR(activeLease.deposit_amount_cents) : "—" },
              {
                label: "Arrears",
                value: arrearsCase ? formatZAR(arrearsCase.total_arrears_cents) : "R 0",
                variant: arrearsCase ? "red" as const : "green" as const,
              },
              {
                label: "Status",
                value: arrearsCase ? `${arrearsCase.months_in_arrears}mo in arrears` : "Good standing",
              },
            ]}
          />
        </SectionCard>
      </DetailFullWidth>

      <DetailFullWidth>
        <SectionCard title="Active maintenance" count={(maintenanceRequests ?? []).length}>
          {(maintenanceRequests ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No active requests.</p>
          ) : (
            <div className="space-y-1">
              {(maintenanceRequests ?? []).map((req) => {
                const unit = req.units as unknown as MaintenanceUnit | null
                return (
                  <RelationshipCard
                    key={req.id}
                    icon={<Wrench className="h-4 w-4 text-amber-600" />}
                    iconBg="#FFFBEB"
                    title={req.title}
                    subtitle={unit ? `${unit.properties?.name ?? ""} — ${unit.unit_number}` : req.category ?? ""}
                    rightBadge={{ text: req.status.replaceAll("_", " "), variant: getMaintenanceStatusVariant(req.status) }}
                    href={`/maintenance/${req.id}`}
                  />
                )
              })}
            </div>
          )}
        </SectionCard>
      </DetailFullWidth>
    </DetailPageLayout>
      </div>{/* end desktop */}
    </div>
  )
}
