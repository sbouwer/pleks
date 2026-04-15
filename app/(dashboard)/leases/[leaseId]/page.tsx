import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect, notFound } from "next/navigation"
import { Badge } from "@/components/ui/badge"
import { LeaseDisclaimerGate } from "@/components/leases/LeaseDisclaimerGate"
import { hasAcceptedLeaseDisclaimer } from "@/lib/leases/disclaimer"
import { buildTenantDisplay } from "@/lib/leases/tenantDisplay"
import { checkLeasePrerequisites } from "@/lib/leases/checkPrerequisites"
import { getLessorBankDetails } from "@/lib/leases/bankDetails"
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
    cpa_applies: boolean | null
    is_fixed_term: boolean | null
    auto_renewal_notice_sent_at: string | null
  },
  today: Date,
): ComplianceItem[] {
  const fmt = (d: Date) => d.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })
  const items: ComplianceItem[] = []

  if (lease.escalation_review_date) {
    const d = new Date(lease.escalation_review_date)
    items.push({ dot: d > today ? "#EF9F27" : "#1D9E75", label: "Next escalation", value: fmt(d) })
  }

  if (lease.end_date && lease.cpa_applies && lease.is_fixed_term) {
    const s14 = new Date(lease.end_date)
    s14.setDate(s14.getDate() - 28)
    const overdue = today > s14 && !lease.auto_renewal_notice_sent_at
    items.push({ dot: overdue ? "#E24B4A" : "#EF9F27", label: "s14 notice due", value: fmt(s14), overdue })
  }

  if (lease.end_date) {
    const end = new Date(lease.end_date)
    items.push({ dot: end < today ? "#E24B4A" : "#378ADD", label: "Lease expiry", value: fmt(end) })
  }

  return items
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
      tenant_view(id, first_name, last_name, company_name, entity_type, email, phone),
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
    id: string; first_name: string | null; last_name: string | null
    company_name: string | null; entity_type: string; email: string | null; phone: string | null
  } | null

  const ownerIdForProperty = unit?.properties?.owner_id ?? null
  const isDraft = lease.status === "draft"

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
  ] = await Promise.all([
    supabase
      .from("lease_co_tenants")
      .select("tenant_id, is_signatory, tenants(id, contacts(first_name, last_name, company_name, entity_type, primary_email, primary_phone))")
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
    ownerIdForProperty
      ? supabase.from("landlord_view").select("id, first_name, last_name, company_name, email, phone").eq("id", ownerIdForProperty).maybeSingle()
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
      ? supabase.from("maintenance_requests").select("id, title, work_order_number, status, created_at").eq("unit_id", lease.unit_id).order("created_at", { ascending: false }).limit(3)
      : Promise.resolve({ data: [], error: null }),
  ])

  // Primary tenant display
  const primaryInput = {
    id: tv?.id ?? lease.tenant_id,
    firstName: tv?.first_name,
    lastName: tv?.last_name,
    companyName: tv?.company_name,
    entityType: tv?.entity_type,
  }

  const coTenantsRaw = (coTenantsRes.data ?? []) as unknown as Array<{
    tenant_id: string
    tenants: {
      id: string
      contacts: {
        first_name: string | null; last_name: string | null
        company_name: string | null; entity_type: string | null
        primary_email: string | null; primary_phone: string | null
      } | null
    } | null
  }>

  const coTenantInputs = coTenantsRaw
    .filter((ct) => ct.tenants)
    .map((ct) => ({
      id: ct.tenants!.id,
      firstName: ct.tenants!.contacts?.first_name ?? null,
      lastName: ct.tenants!.contacts?.last_name ?? null,
      companyName: ct.tenants!.contacts?.company_name ?? null,
      entityType: ct.tenants!.contacts?.entity_type ?? "individual",
    }))

  const display = buildTenantDisplay(primaryInput, coTenantInputs)
  const tenantDisplayText = display.displayText

  // Landlord
  const landlordRaw = landlordRes.data as {
    id: string; first_name: string | null; last_name: string | null
    company_name: string | null; email: string | null; phone: string | null
  } | null
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

  // Build ContactsTab tenants list
  const allTenants: TenantContactInfo[] = []
  if (tv && lease.tenant_id) {
    const isOrg = tv.entity_type === "organisation"
    const primaryName = (isOrg && tv.company_name) ? tv.company_name : `${tv.first_name ?? ""} ${tv.last_name ?? ""}`.trim() || "Unknown"
    allTenants.push({ id: tv.id, name: primaryName, role: "Primary", email: tv.email, phone: tv.phone, entityType: tv.entity_type ?? null, tenantId: lease.tenant_id })
  }
  for (const ct of coTenantsRaw.filter((c) => c.tenants)) {
    const c = ct.tenants!.contacts
    const isOrg = c?.entity_type === "organisation"
    const coName = (isOrg && c?.company_name) ? c.company_name : `${c?.first_name ?? ""} ${c?.last_name ?? ""}`.trim() || "Unknown"
    allTenants.push({ id: ct.tenants!.id, name: coName, role: "Co-tenant", email: c?.primary_email ?? null, phone: c?.primary_phone ?? null, entityType: c?.entity_type ?? null, tenantId: ct.tenants!.id })
  }

  const contactsLandlord: LandlordContactInfo | null = landlordRaw ? {
    id: landlordRaw.id,
    name: landlordName ?? "Unknown",
    company: landlordRaw.company_name ?? null,
    email: landlordRaw.email ?? null,
    phone: landlordRaw.phone ?? null,
  } : null

  const today = new Date()
  const complianceItems = buildComplianceItems(lease, today)
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
            lease={{
              rent_amount_cents: lease.rent_amount_cents ?? null,
              start_date: lease.start_date ?? null,
              end_date: lease.end_date ?? null,
              deposit_amount_cents: lease.deposit_amount_cents ?? null,
              deposit_interest_to: lease.deposit_interest_to ?? null,
              escalation_percent: lease.escalation_percent ?? null,
              payment_due_day: typeof lease.payment_due_day === "string" ? Number.parseInt(lease.payment_due_day, 10) || null : (lease.payment_due_day ?? null),
              is_fixed_term: lease.is_fixed_term ?? null,
            }}
            latestInvoice={latestInvoice}
            arrearsCase={arrearsCase}
            tenantDisplayText={tenantDisplayText}
            tenantEmail={tv?.email ?? null}
            tenantPhone={tv?.phone ?? null}
            landlordName={landlordName}
            landlordId={landlordRaw?.id ?? null}
            lifecycleEvents={lifecycleEvents}
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
            inspections={(inspectionsRes.data ?? []).map((ins: { id: string; inspection_type: string; status: string; scheduled_date: string | null; conducted_date: string | null }) => ({
              id: ins.id,
              inspection_type: ins.inspection_type,
              status: ins.status,
              scheduled_date: ins.scheduled_date,
              completed_at: ins.conducted_date,
            }))}
            maintenanceRequests={(maintenanceRes.data ?? []).map((m: { id: string; title: string; work_order_number: string | null; status: string; created_at: string }) => ({
              id: m.id,
              title: m.title,
              work_order_number: m.work_order_number,
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
