import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect, notFound } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { LeaseDisclaimerGate } from "@/components/leases/LeaseDisclaimerGate"
import { hasAcceptedLeaseDisclaimer } from "@/lib/leases/disclaimer"
import { buildTenantDisplay } from "@/lib/leases/tenantDisplay"
import { checkLeasePrerequisites } from "@/lib/leases/checkPrerequisites"
import { getLessorBankDetails } from "@/lib/leases/bankDetails"
import { decryptNullable } from "@/lib/crypto/encryption"
import { BackLink } from "@/components/ui/BackLink"
import { LeaseTabs } from "./LeaseTabs"
import { OverviewTab } from "./OverviewTab"
import { LeaseDetailsTab } from "./LeaseDetailsTab"
import { ContactsTab, type TenantContactInfo, type LandlordContactInfo } from "./ContactsTab"
import { FinanceTab } from "./FinanceTab"
import { OperationsTab } from "./OperationsTab"

const VALID_TABS = ["overview", "details", "contacts", "finance", "operations"] as const
type Tab = (typeof VALID_TABS)[number]

type ComplianceItem = { dot: string; label: string; value: string | null; overdue?: boolean }

function buildStatusColor(status: string): string {
  if (["active", "month_to_month"].includes(status)) return "bg-emerald-100 text-emerald-700"
  if (status === "notice") return "bg-purple-100 text-purple-700"
  return "bg-muted text-muted-foreground"
}

function buildComplianceItems(
  lease: {
    escalation_review_date: string | null
    end_date: string | null
    escalation_percent: number | null
    cpa_applies: boolean | null
    is_fixed_term: boolean | null
    auto_renewal_notice_sent_at: string | null
  },
  today: Date,
  nextInspectionDate: string | null,
): ComplianceItem[] {
  const fmt = (d: Date) => d.toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" })
  const items: ComplianceItem[] = []

  if (lease.escalation_review_date) {
    const d = new Date(lease.escalation_review_date)
    const pct = lease.escalation_percent ? `${lease.escalation_percent}% fixed increase due` : ""
    items.push({ dot: d > today ? "#EF9F27" : "#1D9E75", label: "Next escalation", value: [fmt(d), pct].filter(Boolean).join(" · ") })
  }

  if (lease.end_date && lease.cpa_applies && lease.is_fixed_term) {
    const s14 = new Date(lease.end_date)
    s14.setDate(s14.getDate() - 28)
    const overdue = today > s14 && !lease.auto_renewal_notice_sent_at
    items.push({ dot: overdue ? "#E24B4A" : "#6b7280", label: "s14 notice due", value: `${fmt(s14)} · 40-80 business days before expiry`, overdue })
  }

  if (nextInspectionDate) {
    const d = new Date(nextInspectionDate)
    const overdue = d < today
    items.push({ dot: overdue ? "#E24B4A" : "#378ADD", label: "Next inspection", value: fmt(d), overdue })
  }

  if (lease.end_date) {
    const end = new Date(lease.end_date)
    const termLabel = lease.is_fixed_term ? "fixed term ends" : ""
    items.push({ dot: end < today ? "#E24B4A" : "#378ADD", label: "Lease expiry", value: [fmt(end), termLabel].filter(Boolean).join(" · ") })
  }

  if (lease.end_date) {
    const deadline = new Date(lease.end_date)
    deadline.setDate(deadline.getDate() + 14)
    items.push({ dot: "#1D9E75", label: "Deposit return deadline", value: `14 days after move-out · statutory` })
  }

  return items
}

function maskSAId(encrypted: string | null | undefined): string | null {
  if (!encrypted) return null
  try {
    const plain = decryptNullable(encrypted)
    if (!plain || plain.length < 6) return null
    return `${plain.slice(0, 6)} ${plain.slice(6, 7)}** ***`
  } catch {
    return null
  }
}

function getIdOrReg(
  entityType: string | null | undefined,
  idNumber: string | null | undefined,
  regNumber: string | null | undefined,
): { idOrRegNumber: string | null; idOrRegLabel: string } {
  if (entityType === "organisation") {
    return { idOrRegNumber: regNumber ?? null, idOrRegLabel: "Reg number" }
  }
  return { idOrRegNumber: maskSAId(idNumber), idOrRegLabel: "ID number" }
}

function derivePortalStatus(
  authUserId: string | null | undefined,
  inviteSentAt: string | null | undefined,
): "none" | "invited" | "active" {
  if (authUserId) return "active"
  if (inviteSentAt) return "invited"
  return "none"
}

type CoTenantRow = {
  tenant_id: string
  tenants: {
    id: string
    contacts: {
      first_name: string | null
      last_name: string | null
      company_name: string | null
      entity_type: string | null
      primary_email: string | null
      primary_phone: string | null
      is_verified: boolean | null
      registration_number: string | null
      id_number: string | null
    } | null
  } | null
}

type PrimaryTenantView = {
  id: string
  contact_id: string | null
  first_name: string | null
  last_name: string | null
  company_name: string | null
  entity_type: string
  email: string | null
  phone: string | null
  id_number: string | null
}

function buildAllTenants(
  tv: PrimaryTenantView | null,
  tenantId: string | null | undefined,
  coTenantsRaw: CoTenantRow[],
  primaryContact: { is_verified: boolean | null; registration_number: string | null } | null,
  portalStatus: "none" | "invited" | "active",
): TenantContactInfo[] {
  const list: TenantContactInfo[] = []
  if (tv && tenantId) {
    const isOrg = tv.entity_type === "organisation"
    const name = (isOrg && tv.company_name)
      ? tv.company_name
      : `${tv.first_name ?? ""} ${tv.last_name ?? ""}`.trim() || "Unknown"
    const { idOrRegNumber, idOrRegLabel } = getIdOrReg(tv.entity_type, tv.id_number, primaryContact?.registration_number)
    list.push({
      id: tv.id, name, role: "Primary", email: tv.email, phone: tv.phone,
      entityType: tv.entity_type ?? null, tenantId,
      ficaVerified: primaryContact?.is_verified ?? null, idOrRegNumber, idOrRegLabel,
      portalStatus, welcomePackSentAt: null,
    })
  }
  for (const ct of coTenantsRaw.filter((c) => c.tenants)) {
    const c = ct.tenants!.contacts
    const isOrg = c?.entity_type === "organisation"
    const name = (isOrg && c?.company_name)
      ? c.company_name
      : `${c?.first_name ?? ""} ${c?.last_name ?? ""}`.trim() || "Unknown"
    const { idOrRegNumber, idOrRegLabel } = getIdOrReg(c?.entity_type, c?.id_number, c?.registration_number)
    list.push({
      id: ct.tenants!.id, name, role: "Co-tenant",
      email: c?.primary_email ?? null, phone: c?.primary_phone ?? null,
      entityType: c?.entity_type ?? null, tenantId: ct.tenants!.id,
      ficaVerified: c?.is_verified ?? null, idOrRegNumber, idOrRegLabel,
      portalStatus: null, welcomePackSentAt: null,
    })
  }
  return list
}

export default async function LeaseDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ leaseId: string }>
  searchParams: Promise<{ tab?: string }>
}) {
  const { leaseId } = await params
  const { tab } = await searchParams
  const activeTab: Tab = (VALID_TABS as readonly string[]).includes(tab ?? "") ? (tab as Tab) : "overview"

  const cookieClient = await createClient()
  const { data: { user } } = await cookieClient.auth.getUser()
  if (!user) redirect("/login")

  const supabase = await createServiceClient()

  const accepted = await hasAcceptedLeaseDisclaimer()

  const { data: lease, error: leaseError } = await supabase
    .from("leases")
    .select(`
      *,
      tenant_view(id, contact_id, first_name, last_name, company_name, entity_type, email, phone, id_number),
      units(unit_number, properties(id, name, address_line1, suburb, city, owner_id))
    `)
    .eq("id", leaseId)
    .single()

  if (leaseError) {
    console.error("LeaseDetailPage: lease fetch failed:", leaseError.message)
    notFound()
  }
  if (!lease) notFound()

  const unit = lease.units as unknown as {
    unit_number: string
    properties: { id: string; name: string; address_line1: string | null; suburb: string | null; city: string | null; owner_id: string | null }
  } | null

  const tv = lease.tenant_view as unknown as {
    id: string
    contact_id: string | null
    first_name: string | null
    last_name: string | null
    company_name: string | null
    entity_type: string
    email: string | null
    phone: string | null
    id_number: string | null
  } | null

  const ownerIdForProperty = unit?.properties?.owner_id ?? null
  const isDraft = lease.status === "draft"

  // SA tax year starts 1 March
  const today = new Date()
  const taxYear = today.getMonth() >= 2 ? today.getFullYear() : today.getFullYear() - 1
  const taxYearStart = `${taxYear}-03-01`

  const [
    coTenantsRes,
    recentPaymentsRes,
    latestInvoiceRes,
    arrearsCaseRes,
    lifecycleEventsRes,
    amendmentsRes,
    editedClauseCountRes,
    landlordRes,
    bankDetails,
    prereqs,
    tenantPortalRes,
    inspectionsRes,
    maintenanceRes,
    primaryContactRes,
    landlordPortalRes,
    ytdPaymentsRes,
    maintenanceCostRes,
  ] = await Promise.all([
    supabase
      .from("lease_co_tenants")
      .select("tenant_id, is_signatory, tenants(id, contacts(first_name, last_name, company_name, entity_type, primary_email, primary_phone, is_verified, registration_number, id_number))")
      .eq("lease_id", leaseId),
    supabase
      .from("payments")
      .select("id, amount_cents, payment_date, payment_method, receipt_number")
      .eq("lease_id", leaseId)
      .order("payment_date", { ascending: false })
      .limit(5),
    supabase
      .from("rent_invoices")
      .select("id, balance_cents, status")
      .eq("lease_id", leaseId)
      .order("due_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("arrears_cases")
      .select("total_arrears_cents, interest_accrued_cents, status, months_in_arrears")
      .eq("lease_id", leaseId)
      .in("status", ["open", "payment_arrangement", "legal"])
      .maybeSingle(),
    supabase
      .from("lease_lifecycle_events")
      .select("id, event_type, description, created_at")
      .eq("lease_id", leaseId)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("lease_amendments")
      .select("*")
      .eq("lease_id", leaseId)
      .order("created_at", { ascending: false }),
    supabase
      .from("lease_clause_selections")
      .select("id", { count: "exact", head: true })
      .eq("lease_id", leaseId)
      .not("custom_body", "is", null),
    // landlord_view gives name/contact/registration data reliably via its JOIN
    ownerIdForProperty
      ? supabase.from("landlord_view").select("id, contact_id, entity_type, first_name, last_name, company_name, registration_number, email, phone").eq("id", ownerIdForProperty).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    getLessorBankDetails(lease.org_id),
    isDraft ? checkLeasePrerequisites(supabase, leaseId, lease.org_id).catch(() => null) : Promise.resolve(null),
    lease.tenant_id
      ? supabase.from("tenants").select("portal_invite_sent_at, auth_user_id").eq("id", lease.tenant_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    lease.unit_id
      ? supabase.from("inspections").select("id, inspection_type, status, scheduled_date, conducted_date").eq("unit_id", lease.unit_id).order("scheduled_date", { ascending: false }).limit(3)
      : Promise.resolve({ data: [], error: null }),
    lease.unit_id
      ? supabase.from("maintenance_requests").select("id, title, work_order_number, urgency, status, created_at").eq("unit_id", lease.unit_id).order("created_at", { ascending: false }).limit(3)
      : Promise.resolve({ data: [], error: null }),
    // Primary tenant FICA + reg number (from contacts table — not in tenant_view)
    tv?.contact_id != null
      ? supabase.from("contacts").select("is_verified, registration_number").eq("id", tv.contact_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    // Landlord portal_status (not in landlord_view)
    ownerIdForProperty
      ? supabase.from("landlords").select("portal_status").eq("id", ownerIdForProperty).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    // YTD payments for collection chart
    supabase
      .from("payments")
      .select("amount_cents, payment_date")
      .eq("lease_id", leaseId)
      .gte("payment_date", taxYearStart)
      .order("payment_date", { ascending: true }),
    // Maintenance cost YTD
    lease.unit_id
      ? supabase
          .from("maintenance_requests")
          .select("actual_cost_cents")
          .eq("unit_id", lease.unit_id)
          .eq("org_id", lease.org_id)
          .gte("created_at", `${taxYearStart}T00:00:00Z`)
          .not("actual_cost_cents", "is", null)
      : Promise.resolve({ data: [], error: null }),
  ])

  const coTenantsRaw = (coTenantsRes.data ?? []) as unknown as CoTenantRow[]

  const coTenantInputs = coTenantsRaw
    .filter((ct) => ct.tenants)
    .map((ct) => ({
      id: ct.tenants!.id,
      firstName: ct.tenants!.contacts?.first_name ?? null,
      lastName: ct.tenants!.contacts?.last_name ?? null,
      companyName: ct.tenants!.contacts?.company_name ?? null,
      entityType: ct.tenants!.contacts?.entity_type ?? "individual",
    }))

  const display = buildTenantDisplay({ id: tv?.id ?? lease.tenant_id, firstName: tv?.first_name, lastName: tv?.last_name, companyName: tv?.company_name, entityType: tv?.entity_type }, coTenantInputs)
  const tenantDisplayText = display.displayText

  if (landlordRes.error) console.error("landlord_view query failed:", landlordRes.error.message, "ownerIdForProperty:", ownerIdForProperty)
  if (!landlordRes.data && ownerIdForProperty) console.warn("landlord_view returned no row for id:", ownerIdForProperty)

  type LandlordRow = { id: string; contact_id: string | null; entity_type: string | null; first_name: string | null; last_name: string | null; company_name: string | null; registration_number: string | null; email: string | null; phone: string | null } | null
  const landlordRaw = landlordRes.data as LandlordRow
  const landlordPortalStatus = (landlordPortalRes.data as { portal_status: string | null } | null)?.portal_status ?? "none"
  const landlordName = landlordRaw
    ? (landlordRaw.company_name ?? `${landlordRaw.first_name ?? ""} ${landlordRaw.last_name ?? ""}`.trim())
    : null

  const tenantPortal = tenantPortalRes.data as { portal_invite_sent_at: string | null; auth_user_id: string | null } | null
  const amendments = amendmentsRes.data ?? []
  const lifecycleEvents = lifecycleEventsRes.data ?? []
  const arrearsCase = arrearsCaseRes.data ?? null
  const latestInvoice = latestInvoiceRes.data ?? null
  const editedClauseCount = editedClauseCountRes.count ?? 0
  const recentPayments = recentPaymentsRes.data ?? []

  const unitLabel = unit ? `${unit.unit_number} — ${unit.properties.name}` : ""
  const areaLabel = [unit?.properties.suburb, unit?.properties.city].filter(Boolean).join(", ")

  const primaryContact = primaryContactRes.data as { is_verified: boolean | null; registration_number: string | null } | null
  const primaryPortalStatus = derivePortalStatus(tenantPortal?.auth_user_id, tenantPortal?.portal_invite_sent_at)
  const allTenants = buildAllTenants(tv, lease.tenant_id, coTenantsRaw, primaryContact, primaryPortalStatus)

  const llIdOrReg = getIdOrReg(landlordRaw?.entity_type, null, landlordRaw?.registration_number)
  const contactsLandlord: LandlordContactInfo | null = landlordRaw ? {
    id: landlordRaw.id,
    name: landlordName ?? "Unknown",
    company: landlordRaw.company_name ?? null,
    email: landlordRaw.email ?? null,
    phone: landlordRaw.phone ?? null,
    entityType: landlordRaw.entity_type ?? null,
    ficaVerified: null,
    idOrRegNumber: llIdOrReg.idOrRegNumber,
    idOrRegLabel: llIdOrReg.idOrRegLabel,
    portalStatus: (landlordPortalStatus as LandlordContactInfo["portalStatus"]) ?? "none",
  } : null

  const ytdPayments = (ytdPaymentsRes.data ?? []) as Array<{ amount_cents: number; payment_date: string }>
  const maintenanceCostRows = (maintenanceCostRes.data ?? []) as Array<{ actual_cost_cents: number }>
  const maintenanceCostCents = maintenanceCostRows.reduce((s, r) => s + (r.actual_cost_cents ?? 0), 0)
  const maintenanceJobCount = maintenanceCostRows.length
  const nextInspectionDate = (inspectionsRes.data ?? [])
    .filter((ins: { scheduled_date: string | null; status: string }) =>
      ins.scheduled_date && !["completed", "cancelled"].includes(ins.status))
    .map((ins: { scheduled_date: string }) => ins.scheduled_date)
    .sort()
    .find((d: string) => new Date(d) >= today) ?? null
  const propertyId = unit?.properties?.id ?? null
  const complianceItems = buildComplianceItems(lease, today, nextInspectionDate)
  const statusColor = buildStatusColor(lease.status)

  return (
    <LeaseDisclaimerGate initialAccepted={accepted}>
      <div>
        <BackLink href="/leases" label="Leases" />

        {/* Fixed header: name + location + badges only */}
        <div className="mb-6">
          <h1 className="font-heading text-2xl font-bold">{tenantDisplayText}</h1>
          {unitLabel && (
            <p className="text-muted-foreground">
              {unitLabel}{areaLabel ? ` · ${areaLabel}` : ""}
            </p>
          )}
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${statusColor}`}>
              {lease.status.replaceAll("_", " ")}
            </span>
            <Badge variant="outline" className="text-xs capitalize">{lease.lease_type}</Badge>
            <Badge variant="outline" className="text-xs">
              {lease.is_fixed_term ? "Fixed term" : "Month to month"}
            </Badge>
            {lease.cpa_applies && lease.lease_type !== "commercial" && (
              <Badge variant="outline" className="text-xs">CPA applies</Badge>
            )}
            {lease.migrated && (
              <Badge variant="outline" className="text-xs border-brand/40 text-brand bg-brand/10">Migrated</Badge>
            )}
            {!lease.migrated && editedClauseCount > 0 && (
              <Badge variant="outline" className="text-xs border-brand/40 text-brand bg-brand/10">Edited</Badge>
            )}
          </div>
        </div>

        {/* Tab nav */}
        <LeaseTabs activeTab={activeTab} leaseId={leaseId} />

        {/* Tab content */}
        {activeTab === "overview" && (
          <OverviewTab
            propertyId={propertyId}
            lease={{
              rent_amount_cents: lease.rent_amount_cents ?? null,
              start_date: lease.start_date ?? null,
              end_date: lease.end_date ?? null,
              deposit_amount_cents: lease.deposit_amount_cents ?? null,
              deposit_interest_to: lease.deposit_interest_to ?? null,
              deposit_interest_rate: lease.deposit_interest_rate ?? null,
              escalation_percent: lease.escalation_percent ?? null,
              escalation_review_date: lease.escalation_review_date ?? null,
              payment_due_day: typeof lease.payment_due_day === "string" ? Number.parseInt(lease.payment_due_day, 10) || null : (lease.payment_due_day ?? null),
              is_fixed_term: lease.is_fixed_term ?? null,
            }}
            latestInvoice={latestInvoice}
            arrearsCase={arrearsCase}
            tenant={tv ? {
              name: tenantDisplayText,
              subtitle: `${tv.entity_type ?? "Individual"} · Primary lessee`,
              email: tv.email,
              phone: tv.phone,
              tenantId: lease.tenant_id ?? null,
            } : null}
            landlord={landlordRaw ? {
              id: landlordRaw.id,
              name: landlordName ?? "Unknown",
              company: landlordRaw.company_name ?? null,
              email: landlordRaw.email ?? null,
              phone: landlordRaw.phone ?? null,
            } : null}
            lifecycleEvents={lifecycleEvents}
            ytdPayments={ytdPayments}
            maintenanceCostCents={maintenanceCostCents}
            maintenanceJobCount={maintenanceJobCount}
            upcomingDeadlines={complianceItems}
          />
        )}

        {activeTab === "details" && (
          <LeaseDetailsTab
            lease={{
              id: leaseId,
              status: lease.status,
              rent_amount_cents: lease.rent_amount_cents ?? null,
              deposit_amount_cents: lease.deposit_amount_cents ?? null,
              deposit_interest_to: lease.deposit_interest_to ?? null,
              escalation_percent: lease.escalation_percent ?? null,
              escalation_type: lease.escalation_type ?? null,
              escalation_review_date: lease.escalation_review_date ?? null,
              payment_due_day: lease.payment_due_day ?? null,
              debicheck_mandate_status: lease.debicheck_mandate_status ?? null,
              start_date: lease.start_date ?? null,
              end_date: lease.end_date ?? null,
              is_fixed_term: lease.is_fixed_term ?? null,
              notice_period_days: lease.notice_period_days ?? null,
              cpa_applies: lease.cpa_applies ?? null,
              auto_renewal_notice_sent_at: lease.auto_renewal_notice_sent_at ?? null,
              special_terms: lease.special_terms ?? null,
              migrated: lease.migrated ?? null,
              external_document_path: lease.external_document_path ?? null,
              generated_doc_path: lease.generated_doc_path ?? null,
              template_source: lease.template_source ?? null,
              docuseal_document_url: lease.docuseal_document_url ?? null,
            }}
            leaseId={leaseId}
            amendments={amendments.map((a) => ({
              id: a.id,
              amendment_type: a.amendment_type,
              effective_date: a.effective_date,
              signed_at: a.signed_at ?? null,
            }))}
            bankDetailsConfigured={bankDetails.configured}
            prereqs={prereqs}
            tenantDisplayText={tenantDisplayText}
            unitLabel={unitLabel}
          />
        )}

        {activeTab === "contacts" && (
          <ContactsTab
            tenants={allTenants}
            landlord={contactsLandlord}
            leaseId={leaseId}
            propertyId={propertyId}
            portalInviteSentAt={tenantPortal?.portal_invite_sent_at ?? null}
            hasAuthUser={!!tenantPortal?.auth_user_id}
            primaryTenantId={lease.tenant_id ?? null}
          />
        )}

        {activeTab === "finance" && (
          <FinanceTab
            leaseId={leaseId}
            balanceCents={latestInvoice?.balance_cents ?? null}
            depositAmountCents={lease.deposit_amount_cents ?? null}
            depositInterestRate={lease.deposit_interest_rate ?? null}
            depositInterestTo={lease.deposit_interest_to ?? null}
            arrearsCaseInterestCents={arrearsCase?.interest_accrued_cents ?? null}
            arraysInterestRate={lease.arrears_interest_rate ?? null}
            recentPayments={recentPayments}
            arrearsCase={arrearsCase}
            latestInvoiceId={latestInvoice?.id ?? null}
          />
        )}

        {activeTab === "operations" && (
          <OperationsTab
            leaseId={leaseId}
            unitId={lease.unit_id ?? null}
            unitNumber={unit?.unit_number ?? null}
            inspections={(inspectionsRes.data ?? []).map((ins: { id: string; inspection_type: string; status: string; scheduled_date: string | null; conducted_date: string | null }) => ({
              id: ins.id,
              inspection_type: ins.inspection_type,
              status: ins.status,
              scheduled_date: ins.scheduled_date,
              completed_at: ins.conducted_date,
            }))}
            maintenanceRequests={(maintenanceRes.data ?? []).map((m: { id: string; title: string; work_order_number: string | null; urgency: string | null; status: string; created_at: string }) => ({
              id: m.id,
              title: m.title,
              work_order_number: m.work_order_number,
              urgency: m.urgency,
              status: m.status,
              created_at: m.created_at,
            }))}
            lifecycleEvents={lifecycleEvents}
            complianceItems={complianceItems}
          />
        )}
      </div>
    </LeaseDisclaimerGate>
  )
}
