/**
 * app/(dashboard)/suppliers/[id]/page.tsx — supplier/contractor detail page (identity, rates, banking, jobs, performance)
 *
 * Route:  /suppliers/[id]
 * Auth:   auth.getUser + user_orgs membership (redirects to /login or /onboarding)
 * Data:   contractor_view, contractors, contact_phones/emails/addresses, maintenance_requests, supplier_invoices
 * Notes:  First page migrated onto the universal DetailPageLayout (ADDENDUM_DETAIL_PAGE_TEMPLATE §4 Phase 1) —
 *         the retired sidebar's identity → header facts + status pill; its sections → grid body blocks.
 *         Banking account number stays masked on display (mask-before-display invariant).
 */
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import Link from "next/link"
import { Wrench, Landmark, Zap, Phone, Mail, MessageCircle, MapPin, type LucideIcon } from "lucide-react"
import { DetailPageLayout, DetailFullWidth } from "@/components/detail/DetailPageLayout"
import { DetailTypeBadge } from "@/components/detail/DetailTypeBadge"
import { supplierArchetypeConfig } from "@/lib/suppliers/archetype"
import { SupplierDetailActions } from "@/components/suppliers/SupplierDetailActions"
import type { DetailFact, DetailStatus } from "@/lib/detail/types"
import { DetailCard, DetailStatGrid } from "@/components/detail/DetailCard"
import { RelationshipCard } from "@/components/contacts/RelationshipCard"
import { BankAccountsSection } from "@/components/contacts/edit/BankAccountsSection"
import { SupplierPeople } from "@/components/suppliers/SupplierPeople"
import { fetchCompanyPeople } from "@/lib/contacts/companyPeople"
import { ContractorPortalSection } from "@/components/contractors/ContractorPortalSection"
import { formatZAR } from "@/lib/constants"

interface Props {
  params: Promise<{ id: string }>
}

const GENDER_LABEL: Record<string, string> = { male: "Male", female: "Female", other: "Other", prefer_not_to_say: "Prefer not to say" }

/** Log-only Supabase error guard (loud-not-fatal); a call keeps cognitive complexity flat vs inline `if`. */
function logErr(label: string, error: { message: string } | null) {
  if (error) console.error(`${label}:`, error.message)
}

/** Account-profile stats — real / derived only (honest-data rule; omit a cell rather than fake it). */
function buildAccountStats(a: Readonly<{
  specialities: string[] | null
  callOutRateCents: number | null
  hourlyRateCents: number | null
  activeJobCount: number
  totalCompleted: number
  totalInvoiced: number
  avgRating: number | null
  regNo: string | null
  vatRegistered: boolean | null | undefined
}>): { label: string; value: string }[] {
  const specialitiesLabel = (a.specialities ?? []).length > 0 ? (a.specialities ?? []).join(", ") : "—"
  // Fixed 8-cell layout so the pairings hold regardless of which rates are set:
  // Trade · Total invoiced / Call-out · Hourly / Jobs · Avg rating / Reg no · VAT
  return [
    { label: "Trade", value: specialitiesLabel },
    { label: "Total invoiced", value: formatZAR(a.totalInvoiced) },
    { label: "Call-out", value: a.callOutRateCents ? formatZAR(a.callOutRateCents) : "—" },
    { label: "Hourly", value: a.hourlyRateCents ? formatZAR(a.hourlyRateCents) : "—" },
    { label: "Jobs", value: `${a.activeJobCount} open · ${a.totalCompleted} done` },
    { label: "Avg rating", value: a.avgRating != null ? `${a.avgRating}/5` : "—" },
    { label: "Reg no.", value: a.regNo || "—" },
    { label: "VAT", value: a.vatRegistered ? "Registered" : "Not registered" },
  ]
}

/** Why archiving is blocked (open obligations), or null if allowed. Server enforces the same guard. */
function archiveBlockReason(activeJobCount: number, openInvoiceCount: number): string | null {
  if (activeJobCount > 0) return "This supplier has active work orders — close or reassign them first."
  if (openInvoiceCount > 0) return "This supplier has unpaid invoices — resolve them before archiving."
  return null
}

/** WhatsApp deep link (SA 0 → 27), or null. */
function waLink(phone: string | null): string | null {
  if (!phone) return null
  const d = phone.replaceAll(/\D/g, "")
  if (!d) return null
  return `https://wa.me/${d.startsWith("0") ? `27${d.slice(1)}` : d}`
}

/** Identity-card derived bits — address line, primary contact person + "+N more", wa link. */
function buildSupplierIdentity(a: Readonly<{
  entityType: string | null
  companyPeople: { name: string }[]
  address: { street_line1?: string | null; suburb?: string | null; city?: string | null } | undefined
  phone: string | null
}>): { addressStr: string | null; contactPerson: string | null; extraPeople: number; waHref: string | null } {
  const addressStr = a.address
    ? [a.address.street_line1, a.address.suburb, a.address.city].filter(Boolean).join(", ") || null
    : null
  const isOrg = a.entityType === "organisation"
  const contactPerson = isOrg ? (a.companyPeople[0]?.name ?? null) : null
  const extraPeople = isOrg ? Math.max(0, a.companyPeople.length - 1) : 0
  return { addressStr, contactPerson, extraPeople, waHref: waLink(a.phone) }
}

/** One icon+text row in the identity card — clickable (tel/mailto/wa.me) when an href is given. */
function ContactLine({ icon: Icon, href, children }: Readonly<{ icon: LucideIcon; href?: string; children: React.ReactNode }>) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      {href
        ? <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer" className="truncate transition-colors hover:text-brand">{children}</a>
        : <span className="truncate">{children}</span>}
    </div>
  )
}

async function fetchInvoiceData(service: Awaited<ReturnType<typeof createServiceClient>>, contractorId: string) {
  const [{ data: invData }, { data: invTotal }, { count: openCount }] = await Promise.all([
    service
      .from("supplier_invoices")
      .select("id, invoice_number, amount_incl_vat_cents, status, invoice_date")
      .eq("contractor_id", contractorId)
      .order("invoice_date", { ascending: false })
      .limit(5),
    service
      .from("supplier_invoices")
      .select("amount_incl_vat_cents")
      .eq("contractor_id", contractorId)
      .eq("status", "paid"),
    service
      .from("supplier_invoices")
      .select("id", { count: "exact", head: true })
      .eq("contractor_id", contractorId)
      .not("status", "in", "(paid,rejected,owner_direct_recorded)"),
  ])
  return {
    recentInvoices: (invData ?? []) as Array<{ id: string; invoice_number: string | null; amount_incl_vat_cents: number; status: string; invoice_date: string }>,
    totalInvoiced: (invTotal ?? []).reduce((sum, i) => sum + (i.amount_incl_vat_cents || 0), 0),
    openInvoiceCount: openCount ?? 0,
  }
}

async function fetchContractorDelayStats(
  service: Awaited<ReturnType<typeof createServiceClient>>,
  jobIds: string[],
  orgId: string,
) {
  if (jobIds.length === 0) return { noShowCount: 0, contractorRescheduleCount: 0, incompleteCount: 0, avgResponseHours: null }

  const [{ data: delayData }, { data: jobTiming }, { data: firstUpdates }] = await Promise.all([
    service.from("maintenance_delay_events").select("delay_type").in("maintenance_id", jobIds).eq("attributed_to", "contractor").eq("org_id", orgId),
    service.from("maintenance_requests").select("id, work_order_sent_at").in("id", jobIds).not("work_order_sent_at", "is", null),
    service.from("contractor_updates").select("request_id, created_at").in("request_id", jobIds).order("created_at", { ascending: true }),
  ])

  const delays = delayData ?? []
  return {
    noShowCount: delays.filter((d) => d.delay_type === "contractor_no_show").length,
    contractorRescheduleCount: delays.filter((d) => d.delay_type === "contractor_rescheduled").length,
    incompleteCount: delays.filter((d) => d.delay_type === "contractor_returned_incomplete").length,
    avgResponseHours: jobTiming && firstUpdates ? computeAvgResponseHours(jobTiming, firstUpdates) : null,
  }
}

function computeAvgResponseHours(
  jobTiming: Array<{ id: string; work_order_sent_at: string | null }>,
  firstUpdates: Array<{ request_id: string; created_at: string }>,
): number | null {
  const firstUpdateMap = new Map<string, string>()
  for (const u of firstUpdates) {
    if (!firstUpdateMap.has(u.request_id)) firstUpdateMap.set(u.request_id, u.created_at)
  }
  const responseTimes = jobTiming
    .filter((j) => j.work_order_sent_at && firstUpdateMap.has(j.id))
    .map((j) => {
      const sentMs = new Date(j.work_order_sent_at!).getTime()
      const respondedMs = new Date(firstUpdateMap.get(j.id) ?? "").getTime()
      return (respondedMs - sentMs) / (1000 * 60 * 60)
    })
    .filter((h) => h >= 0)
  if (responseTimes.length === 0) return null
  return Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length * 10) / 10
}

export default async function ContractorDetailPage({ params }: Props) {
  const { id } = await params

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

  logErr("ContractorDetailPage user_orgs read failed", membershipError)
  if (!membership) redirect("/onboarding")

  // Fetch contractor from view
  const { data: contractor, error: contractorError } = await service
    .from("contractor_view")
    .select("id, contact_id, entity_type, first_name, last_name, company_name, trading_as, registration_number, vat_number, email, phone, specialities, is_active, notes, call_out_rate_cents, hourly_rate_cents, supplier_type, property_ids")
    .eq("id", id)
    .eq("org_id", membership.org_id)
    .single()

  logErr("ContractorDetailPage contractor_view read failed", contractorError)
  if (!contractor) redirect("/suppliers")

  // 25A: people under a company supplier (operator, accounts…). Empty for sole-proprietor individuals.
  const companyPeople = contractor.entity_type === "organisation"
    ? await fetchCompanyPeople(service, membership.org_id, contractor.contact_id)
    : []

  // Fetch VAT flag + portal info from contractors (banking moved to contact_bank_accounts)
  const { data: contractorBanking, error: contractorBankingError } = await service
    .from("contractors")
    .select("vat_registered, portal_status, portal_invite_sent_at")
    .eq("id", id)
    .eq("org_id", membership.org_id)
    .single()
  logErr("ContractorDetailPage contractors read failed", contractorBankingError)

  // Bank accounts — global multi-account banking (contact-scoped)
  const { data: bankAccounts, error: bankAccountsError } = await service
    .from("contact_bank_accounts")
    .select("id, account_name, bank_name, account_number, branch_code, account_type, label, is_primary")
    .eq("contact_id", contractor.contact_id)
    .eq("org_id", membership.org_id)
    .order("is_primary", { ascending: false })
  logErr("ContractorDetailPage contact_bank_accounts read failed", bankAccountsError)

  // Identity extras (title/gender) not on contractor_view — title prefixes the name, gender shows as a fact
  const { data: supplierIdentityExtra, error: supplierIdentityExtraError } = await service
    .from("contacts")
    .select("title, gender")
    .eq("id", contractor.contact_id)
    .eq("org_id", membership.org_id)
    .single()
  logErr("ContractorDetailPage contacts read failed", supplierIdentityExtraError)

  // Fetch org tier for portal gating
  const { data: sub, error: subError } = await service
    .from("subscriptions")
    .select("tier")
    .eq("org_id", membership.org_id)
    .single()
  logErr("ContractorDetailPage subscriptions read failed", subError)
  const orgTier = sub?.tier ?? "steward"

  // Fetch contact phones
  const { data: phones, error: phonesError } = await service
    .from("contact_phones")
    .select("id, number, phone_type, label, is_primary, can_whatsapp")
    .eq("contact_id", contractor.contact_id)
    .order("is_primary", { ascending: false })
  logErr("ContractorDetailPage contact_phones read failed", phonesError)

  // Fetch contact emails
  const { data: emails, error: emailsError } = await service
    .from("contact_emails")
    .select("id, email, email_type, label, is_primary")
    .eq("contact_id", contractor.contact_id)
    .order("is_primary", { ascending: false })
  logErr("ContractorDetailPage contact_emails read failed", emailsError)

  // Fetch contact addresses
  const { data: addresses, error: addressesError } = await service
    .from("contact_addresses")
    .select("id, street_line1, street_line2, suburb, city, province, postal_code, country, address_type, is_primary")
    .eq("contact_id", contractor.contact_id)
    .order("is_primary", { ascending: false })
  logErr("ContractorDetailPage contact_addresses read failed", addressesError)

  // Active maintenance jobs assigned to this contractor
  const { data: activeJobs, error: activeJobsError } = await service
    .from("maintenance_requests")
    .select("id, title, category, status, urgency, created_at, quoted_cost_cents, units(unit_number, properties(name))")
    .eq("contractor_id", id)
    .not("status", "in", "(completed,closed,cancelled)")
    .order("created_at", { ascending: false })
  logErr("ContractorDetailPage active maintenance_requests read failed", activeJobsError)

  // Completed jobs for performance stats
  const { data: completedJobs, error: completedJobsError } = await service
    .from("maintenance_requests")
    .select("id, created_at, completed_at, tenant_rating")
    .eq("contractor_id", id)
    .eq("status", "completed")
  logErr("ContractorDetailPage completed maintenance_requests read failed", completedJobsError)

  // Recent invoices
  const { recentInvoices, totalInvoiced, openInvoiceCount } = await fetchInvoiceData(service, id)

  // Delay event + response time stats
  const allContractorJobIds = [
    ...(activeJobs ?? []).map((j) => j.id),
    ...(completedJobs ?? []).map((j) => j.id),
  ]
  const { noShowCount, contractorRescheduleCount, incompleteCount, avgResponseHours } =
    await fetchContractorDelayStats(service, allContractorJobIds, membership.org_id)

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

  const displayName = contractor.company_name ||
    [supplierIdentityExtra?.title, contractor.first_name, contractor.last_name].filter(Boolean).join(" ").trim() ||
    "Unnamed Contractor"
  // primary-vs-child fallback: modal-created suppliers write contacts.primary_* (→ contractor_view.phone/
  // email), not the child tables, so fall back to those or the card shows "—" (project_pleks_contact_primary_vs_child).
  const primaryPhone = phones?.[0]?.number ?? contractor.phone ?? null
  const primaryEmail = emails?.[0]?.email ?? contractor.email ?? null
  const activeJobCount = (activeJobs ?? []).length
  // primary-vs-child fallback above (project_pleks_contact_primary_vs_child); identity bits below.
  const { addressStr, waHref } = buildSupplierIdentity({
    entityType: contractor.entity_type,
    companyPeople,
    address: (addresses ?? [])[0],
    phone: primaryPhone,
  })

  const accountStats = buildAccountStats({
    specialities: contractor.specialities,
    callOutRateCents: contractor.call_out_rate_cents ?? null,
    hourlyRateCents: contractor.hourly_rate_cents ?? null,
    activeJobCount,
    totalCompleted,
    totalInvoiced,
    avgRating,
    regNo: contractor.registration_number,
    vatRegistered: contractorBanking?.vat_registered,
  })

  // Identity → status pill (active/inactive) + the type chip (archetype) + the header facts strip.
  const status: DetailStatus = contractor.is_active
    ? { kind: "occupied", label: "Active" }
    : { kind: "neutral", label: "Inactive" }
  const arch = supplierArchetypeConfig(contractor.supplier_type)
  const archIcon = { contractor: Wrench, scheme: Landmark, utility: Zap }[arch.archetype]

  // Pre-check for a styled "can't archive because …" message instead of a failed request.
  const archiveBlock = archiveBlockReason(activeJobCount, openInvoiceCount)

  const facts: DetailFact[] = [
    { k: "Type", v: contractor.entity_type === "organisation" ? "Company" : "Individual" },
    { k: "Specialities", v: (contractor.specialities ?? []).length > 0 ? (contractor.specialities ?? []).join(", ") : "—" },
    { k: "Active jobs", v: String(activeJobCount) },
    { k: "Avg rating", v: avgRating != null ? `${avgRating} / 5` : "—" },
  ]
  if (contractor.entity_type !== "organisation" && supplierIdentityExtra?.gender) {
    facts.push({ k: "Gender", v: GENDER_LABEL[supplierIdentityExtra.gender] ?? supplierIdentityExtra.gender })
  }
  if (contractorBanking?.vat_registered) facts.push({ k: "VAT", v: "Registered" })

  return (
    <DetailPageLayout
      category="Suppliers"
      backHref="/suppliers"
      title={displayName}
      status={status}
      badge={<DetailTypeBadge label={arch.badgeLabel} icon={archIcon} />}
      facts={facts}
      actions={<SupplierDetailActions supplierId={id} contactId={contractor.contact_id} supplierName={displayName} archiveBlock={archiveBlock} />}
    >
      {/* Row 1 — identity · Account profile (read-only; edit via the header Edit modal). */}
      <DetailCard title={arch.badgeLabel}>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand/20 text-sm font-semibold text-brand">
                {displayName.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">{displayName}</p>
                <p className="text-xs text-muted-foreground">{contractor.entity_type === "organisation" ? "Company" : "Individual"}</p>
              </div>
            </div>
            <div className="space-y-1.5 border-t border-border/40 pt-3">
              <ContactLine icon={Phone} href={primaryPhone ? `tel:${primaryPhone}` : undefined}>{primaryPhone ?? <span className="text-muted-foreground">—</span>}</ContactLine>
              <ContactLine icon={Mail} href={primaryEmail ? `mailto:${primaryEmail}` : undefined}>{primaryEmail ?? <span className="text-muted-foreground">—</span>}</ContactLine>
              {waHref && <ContactLine icon={MessageCircle} href={waHref}>WhatsApp</ContactLine>}
              {contractor.entity_type === "organisation" && (
                <SupplierPeople people={companyPeople} companyContactId={contractor.contact_id} />
              )}
              <ContactLine icon={MapPin}>{addressStr ?? <span className="text-muted-foreground">—</span>}</ContactLine>
            </div>
          </div>
      </DetailCard>
      <DetailCard title="Account profile" flush>
        <DetailStatGrid stats={accountStats} />
      </DetailCard>
      <BankAccountsSection
        entityType="suppliers"
        entityId={id}
        contactId={contractor.contact_id}
        accounts={bankAccounts ?? []}
      />
      <ContractorPortalSection
        contractorId={id}
        tier={orgTier}
        portalStatus={(contractorBanking?.portal_status ?? "none") as "none" | "invited" | "active" | "suspended"}
        portalInviteSentAt={contractorBanking?.portal_invite_sent_at ?? null}
        contractorEmail={primaryEmail}
      />

      {/* Active jobs · Recent invoices — side by side */}
      <DetailCard title="Active jobs" count={activeJobCount}>
        {activeJobCount === 0 ? (
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
      </DetailCard>
      <DetailCard title="Recent invoices" count={recentInvoices.length}>
        {recentInvoices.length === 0 ? (
          <p className="text-sm text-muted-foreground">No invoices yet.</p>
        ) : (
          <div className="space-y-0.5">
            {recentInvoices.map((inv) => (
              <Link
                key={inv.id}
                href={`/payments/invoices/${inv.id}`}
                className="flex items-center justify-between gap-3 rounded-[var(--r-button)] px-2 py-1.5 text-sm transition-colors hover:bg-muted/50"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: inv.status === "paid" ? "#1D9E75" : "#D85A30" }} />
                  <span className="truncate">{inv.invoice_number ?? "Invoice"} — {formatZAR(inv.amount_incl_vat_cents)}</span>
                  <span className="shrink-0 text-xs capitalize text-muted-foreground">· {inv.status.replaceAll("_", " ")}</span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{new Date(inv.invoice_date).toLocaleDateString("en-ZA")}</span>
              </Link>
            ))}
          </div>
        )}
      </DetailCard>

      {/* Performance (full-width) */}
      <DetailFullWidth>
        <DetailCard title="Performance" flush>
          <DetailStatGrid stats={[
            { label: "Jobs completed", value: String(totalCompleted) },
            { label: "Avg completion", value: totalCompleted > 0 ? `${avgCompletionDays} days` : "—" },
            { label: "Avg response", value: avgResponseHours === null ? "—" : `${avgResponseHours}h` },
            { label: "Avg rating", value: avgRating != null ? `${avgRating}/5` : "—" },
            { label: "No-shows", value: noShowCount > 0 ? String(noShowCount) : "—" },
            { label: "Reschedules", value: contractorRescheduleCount > 0 ? String(contractorRescheduleCount) : "—" },
            { label: "Incomplete returns", value: incompleteCount > 0 ? String(incompleteCount) : "—" },
            { label: "Total invoiced", value: formatZAR(totalInvoiced) },
          ]} />
        </DetailCard>
      </DetailFullWidth>
    </DetailPageLayout>
  )
}
