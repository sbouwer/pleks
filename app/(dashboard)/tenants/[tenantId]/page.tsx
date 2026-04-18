import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect, notFound } from "next/navigation"
import { Home, Wrench } from "lucide-react"
import { ContactDetailLayout } from "@/components/contacts/ContactDetailLayout"
import { ContactSidebar } from "@/components/contacts/ContactSidebar"
import { QuickActions } from "@/components/contacts/QuickActions"
import { SectionCard } from "@/components/contacts/SectionCard"
import { RelationshipCard } from "@/components/contacts/RelationshipCard"
import { StatGrid } from "@/components/contacts/StatGrid"
import { TenantContactSection, TenantIdentitySection, TenantEmploymentSection, TenantAddressSection, TenantJuristicSection } from "./TenantSections"
import { MobileTenantView } from "@/components/mobile/MobileTenantView"
import { formatZAR } from "@/lib/constants"

// ─── Types ────────────────────────────────────────────────────────────────────

type BadgeVariant = "green" | "amber" | "red" | "blue" | "gray"
type Badge = { text: string; variant: BadgeVariant }

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

function getInitials(name: string): string {
  return name.split(" ").map((w) => w[0]).filter(Boolean).join("").slice(0, 2).toUpperCase()
}

function buildBadges(tenant: TenantRow, activeLease: LeaseRow | null, arrearsCase: ArrearsCase | null): Badge[] {
  const badges: Badge[] = []
  if (activeLease) {
    badges.push({
      text: activeLease.status === "notice" ? "Notice period" : "Active lease",
      variant: activeLease.status === "notice" ? "amber" : "green",
    })
  } else {
    badges.push({ text: "No active lease", variant: "gray" })
  }
  if (arrearsCase) {
    badges.push({ text: `${arrearsCase.months_in_arrears}mo arrears`, variant: "red" })
  } else {
    badges.push({ text: "Good standing", variant: "green" })
  }
  if (tenant.blacklisted) {
    badges.push({ text: "Blacklisted", variant: "red" })
  }
  return badges
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
      .select("id, street_line1, street_line2, suburb, city, province, postal_code, address_type, is_primary")
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
    const { data } = await service
      .from("arrears_cases")
      .select("total_arrears_cents, interest_accrued_cents, status, months_in_arrears")
      .eq("tenant_id", tenantId)
      .in("status", ["open", "payment_arrangement", "legal"])
      .limit(1)
      .maybeSingle()
    arrearsCase = data
  } catch {
    arrearsCase = null
  }

  const displayName = getDisplayName(tenant)
  const badges = buildBadges(tenant, activeLease ?? null, arrearsCase)
  const primaryPhone = phones?.[0]?.number ?? null
  const primaryEmail = emails?.[0]?.email ?? null
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
    <ContactDetailLayout
      breadcrumb={{ label: "Tenants", href: "/tenants" }}
      sidebar={
        <ContactSidebar
          avatar={{ initials: getInitials(displayName), bgColor: "#EEF2FF", textColor: "#4F46E5" }}
          name={displayName}
          subtitle={tenant.entity_type === "individual" ? "Individual tenant" : "Company tenant"}
          badges={badges}
          quickActions={
            <QuickActions
              primaryPhone={primaryPhone}
              primaryEmail={primaryEmail}
              moreItems={[
                { label: "Send notice" },
                { label: "Archive", variant: "danger" as const },
              ]}
            />
          }
        >
          <TenantContactSection entityId={tenantId} phones={phones ?? []} emails={emails ?? []} />
          <TenantIdentitySection
            idNumber={tenant.id_number ?? null}
            idType={tenant.id_type ?? null}
            dateOfBirth={tenant.date_of_birth ?? null}
            nationality={tenant.nationality ?? null}
          />
          {tenant.entity_type === "individual" && (
            <TenantEmploymentSection
              tenantId={tenantId}
              employerName={tenant.employer_name ?? null}
              employerPhone={tenant.employer_phone ?? null}
              occupation={tenant.occupation ?? null}
              employmentType={tenant.employment_type ?? null}
              preferredContact={tenant.preferred_contact ?? null}
            />
          )}
          {tenant.entity_type !== "individual" && (
            <TenantJuristicSection
              contactId={tenant.contact_id}
              juristicType={(tenant as Record<string, unknown>).juristic_type as string | null ?? null}
              turnoverUnder2m={(tenant as Record<string, unknown>).turnover_under_2m as boolean | null ?? null}
              assetValueUnder2m={(tenant as Record<string, unknown>).asset_value_under_2m as boolean | null ?? null}
              sizeBandsCapturedAt={(tenant as Record<string, unknown>).size_bands_captured_at as string | null ?? null}
            />
          )}
          <TenantAddressSection entityId={tenantId} address={(addresses ?? [])[0] ?? null} />
        </ContactSidebar>
      }
    >
      {/* Current lease */}
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

      {/* Payment status */}
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

      {/* Maintenance requests */}
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
    </ContactDetailLayout>
      </div>{/* end desktop */}
    </div>
  )
}
