import { createClient } from "@/lib/supabase/server"
import { redirect, notFound } from "next/navigation"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { LeaseActions } from "./LeaseActions"
import { MigratedDocSection } from "./MigratedDocSection"
import { LeaseTermsGrid } from "./LeaseTermsGrid"
import { PaymentStatus } from "./PaymentStatus"
import { LeaseTimeline } from "./LeaseTimeline"
import { TenantCards, buildTenantContact } from "./TenantCards"
import { PrerequisitesCard } from "./PrerequisitesCard"
import { SigningOptions } from "./SigningOptions"
import { LeaseCharges } from "@/components/leases/LeaseCharges"
import { buildTenantDisplay } from "@/lib/leases/tenantDisplay"
import { checkLeasePrerequisites } from "@/lib/leases/checkPrerequisites"
import { AlertTriangle } from "lucide-react"
import { getLessorBankDetails } from "@/lib/leases/bankDetails"
import { formatZAR } from "@/lib/constants"

const STATUS_MAP: Record<string, string> = {
  draft: "draft", pending_signing: "pending", active: "active",
  notice: "notice", expired: "cancelled", cancelled: "cancelled",
  month_to_month: "active",
}

const EVENT_DOT: Record<string, string> = {
  lease_created: "#7F77DD", lease_signed: "#7F77DD", lease_renewed: "#7F77DD",
  deposit_received: "#1D9E75", escalation_processed: "#1D9E75",
  inspection_scheduled: "#378ADD", inspection_completed: "#378ADD",
  notice_given: "#EF9F27", s14_notice_sent: "#EF9F27",
  lease_expired: "#E24B4A", lease_cancelled: "#E24B4A",
}

export default async function LeaseDetailPage({
  params,
}: {
  params: Promise<{ leaseId: string }>
}) {
  const { leaseId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect("/login")

  // Main lease fetch — includes unit, property, and property owner_id for landlord
  const { data: lease } = await supabase
    .from("leases")
    .select(`
      *,
      tenant_view(id, first_name, last_name, company_name, entity_type, email, phone),
      units(unit_number, properties(id, name, address_line1, suburb, city, owner_id))
    `)
    .eq("id", leaseId)
    .single()

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

  // All secondary fetches in parallel
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
  ] = await Promise.all([
    supabase
      .from("lease_co_tenants")
      .select("tenant_id, is_signatory, tenants(id, contacts(first_name, last_name, company_name, entity_type, primary_email, primary_phone))")
      .eq("lease_id", leaseId),
    supabase
      .from("payments")
      .select("id, amount_cents, payment_date, payment_method")
      .eq("lease_id", leaseId)
      .order("payment_date", { ascending: false })
      .limit(5),
    supabase
      .from("rent_invoices")
      .select("balance_cents, status")
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
      ? supabase.from("landlord_view").select("id, first_name, last_name, company_name").eq("id", ownerIdForProperty).maybeSingle()
      : Promise.resolve({ data: null }),
    getLessorBankDetails(lease.org_id),
    isDraft ? checkLeasePrerequisites(supabase, leaseId, lease.org_id).catch(() => null) : Promise.resolve(null),
  ])

  // Build tenant display
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

  // Build TenantCards data
  const primaryContact = buildTenantContact(
    primaryInput.id,
    tv ? { ...tv, primary_email: tv.email, primary_phone: tv.phone } : null,
    "Primary tenant",
  )
  const coTenantCards = coTenantsRaw
    .filter((ct) => ct.tenants)
    .map((ct) => buildTenantContact(ct.tenants!.id, ct.tenants!.contacts, "Co-tenant"))

  // Landlord
  const landlord = landlordRes.data as { id: string; first_name: string | null; last_name: string | null; company_name: string | null } | null
  const landlordName = landlord
    ? (landlord.company_name ?? `${landlord.first_name ?? ""} ${landlord.last_name ?? ""}`.trim())
    : null

  const amendments = amendmentsRes.data ?? []
  const lifecycleEvents = lifecycleEventsRes.data ?? []
  const editedClauseCount = editedClauseCountRes.count ?? 0
  const arrearsCase = arrearsCaseRes.data ?? null
  const latestInvoice = latestInvoiceRes.data ?? null

  const unitLabel = unit ? `${unit.unit_number} — ${unit.properties.name}` : ""
  const areaLabel = [unit?.properties.suburb, unit?.properties.city].filter(Boolean).join(", ")

  return (
    <div>
      {/* Breadcrumb + header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <p className="mb-1 text-sm text-muted-foreground">
            <Link href="/leases" className="hover:text-foreground">Leases</Link>
            {" ›"} {tenantDisplayText} — {unitLabel}
          </p>
          <h1 className="font-heading text-2xl font-bold">{tenantDisplayText}</h1>
          {unitLabel && (
            <p className="text-muted-foreground">
              {unitLabel}
              {areaLabel ? ` · ${areaLabel}` : ""}
            </p>
          )}
          {/* Badges */}
          <div className="mt-2 flex flex-wrap gap-1.5">
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ${
              ["active", "month_to_month"].includes(lease.status)
                ? "bg-emerald-100 text-emerald-700"
                : lease.status === "notice"
                ? "bg-purple-100 text-purple-700"
                : "bg-muted text-muted-foreground"
            }`}>
              {lease.status.replaceAll("_", " ")}
            </span>
            <Badge variant="outline" className="text-xs capitalize">{lease.lease_type}</Badge>
            {lease.is_fixed_term && <Badge variant="outline" className="text-xs">Fixed term</Badge>}
            {lease.cpa_applies && <Badge variant="outline" className="text-xs">CPA applies</Badge>}
            {lease.migrated && (
              <Badge variant="outline" className="text-xs border-brand/40 text-brand bg-brand/10">
                Migrated
              </Badge>
            )}
            {!lease.migrated && lease.template_type === "custom" && (
              <Badge variant="outline" className="text-xs border-brand/40 text-brand bg-brand/10">
                Custom template
              </Badge>
            )}
            {!lease.migrated && lease.template_type !== "custom" && editedClauseCount > 0 && (
              <Badge variant="outline" className="text-xs border-brand/40 text-brand bg-brand/10">
                Edited
              </Badge>
            )}
          </div>
        </div>
        <LeaseActions leaseId={leaseId} status={lease.status} />
      </div>

      {/* Trust account warning (draft leases) */}
      {!bankDetails.configured && lease.status === "draft" && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <p className="text-amber-200">
            Trust account banking details are not configured.{" "}
            <Link href="/settings/compliance" className="underline hover:text-foreground">
              Settings → Banking
            </Link>
          </p>
        </div>
      )}

      {/* Migrated document section */}
      {lease.migrated && (
        <MigratedDocSection
          leaseId={leaseId}
          externalDocPath={lease.external_document_path ?? null}
        />
      )}

      {/* Draft: prerequisites + signing options */}
      {isDraft && prereqs && (
        <div className="mb-6 space-y-4">
          <PrerequisitesCard prereqs={prereqs} leaseId={leaseId} />
          <SigningOptions
            leaseId={leaseId}
            hasGeneratedDoc={lease.generated_doc_path != null}
            hasExternalDoc={lease.external_document_path != null}
            hasDocusealDoc={lease.docuseal_document_url != null}
            canProceed={prereqs.canProceed}
            tenantName={tenantDisplayText}
            unitLabel={unitLabel}
            depositAmountCents={lease.deposit_amount_cents ?? null}
            startDate={lease.start_date ?? null}
            rentAmountCents={lease.rent_amount_cents ?? 0}
          />
        </div>
      )}

      {/* Two-panel layout */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_300px]">

        {/* ── Left panel ── */}
        <div className="space-y-4">

          {/* Section 1: Lease terms */}
          <section>
            <h2 className="mb-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">Lease terms</h2>
            <LeaseTermsGrid
              rentAmountCents={lease.rent_amount_cents ?? 0}
              depositAmountCents={lease.deposit_amount_cents ?? null}
              depositInterestTo={lease.deposit_interest_to ?? null}
              escalationPercent={lease.escalation_percent ?? null}
              escalationType={lease.escalation_type ?? null}
              escalationReviewDate={lease.escalation_review_date ?? null}
              paymentDueDay={lease.payment_due_day ?? null}
              debicheckStatus={lease.debicheck_mandate_status ?? null}
            />
          </section>

          {/* Section 2: Payment status */}
          <section>
            <PaymentStatus
              leaseId={leaseId}
              balanceCents={latestInvoice?.balance_cents ?? null}
              invoiceStatus={latestInvoice?.status ?? null}
              recentPayments={recentPaymentsRes.data ?? []}
              arrearsCase={arrearsCase}
            />
          </section>

          {/* Section 3: Additional charges (existing component) */}
          <LeaseCharges leaseId={leaseId} />

          {/* Section 4: Special agreements */}
          {(lease.special_terms as unknown[])?.length > 0 && (
            <section>
              <div className="rounded-xl border bg-card p-4">
                <h3 className="mb-3 text-sm font-semibold">Special agreements (Addendum D)</h3>
                <ul className="space-y-2">
                  {(lease.special_terms as { type: string; detail: string }[]).map((term, i) => (
                    <li key={i} className="text-sm">
                      <span className="font-medium capitalize">{term.type.replaceAll("_", " ")}</span>
                      <span className="text-muted-foreground"> — {term.detail}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}

          {/* Section 5: Amendments */}
          {amendments.length > 0 && (
            <section>
              <div className="rounded-xl border bg-card p-4">
                <h3 className="mb-3 text-sm font-semibold">Amendments</h3>
                <div className="space-y-3">
                  {amendments.map((a) => (
                    <div key={a.id} className="flex items-center justify-between text-sm">
                      <div>
                        <span className="font-medium capitalize">{a.amendment_type.replaceAll("_", " ")}</span>
                        <span className="ml-2 text-muted-foreground">Effective {a.effective_date}</span>
                      </div>
                      {a.signed_at && (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">Signed</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </section>
          )}
        </div>

        {/* ── Right sidebar ── */}
        <div className="space-y-3">

          {/* Sidebar 1: Lease timeline */}
          <LeaseTimeline
            startDate={lease.start_date ?? null}
            endDate={lease.end_date ?? null}
            noticePeriodDays={lease.notice_period_days ?? 20}
            isFixedTerm={lease.is_fixed_term ?? false}
            cpaApplies={lease.cpa_applies ?? false}
            autoRenewalNoticeSentAt={lease.auto_renewal_notice_sent_at ?? null}
          />

          {/* Sidebar 2: Tenant cards */}
          <TenantCards primary={primaryContact} coTenants={coTenantCards} />

          {/* Sidebar 3: Landlord */}
          {landlord && landlordName && (
            <div className="rounded-xl border bg-card p-4">
              <p className="mb-2 text-[11px] uppercase tracking-wide text-muted-foreground">Owner</p>
              <Link
                href={`/landlords/${landlord.id}`}
                className="flex items-center gap-3 hover:opacity-80 transition-opacity"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/20 text-sm font-semibold text-brand">
                  {landlordName.slice(0, 2).toUpperCase()}
                </div>
                <p className="font-medium hover:underline">{landlordName}</p>
              </Link>
            </div>
          )}

          {/* Sidebar 4: Interest settings */}
          {(lease.deposit_interest_rate != null || lease.arrears_interest_rate != null) && (
            <div className="rounded-xl border bg-card p-4">
              <h3 className="mb-3 text-sm font-semibold">Interest settings</h3>
              <div className="space-y-2 text-sm">
                {lease.deposit_interest_rate != null && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Deposit rate</span>
                    <span>{lease.deposit_interest_rate}% p.a.</span>
                  </div>
                )}
                {lease.arrears_interest_rate != null && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Arrears rate</span>
                    <span>Prime + {lease.arrears_interest_rate}%</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Sidebar 5: Lease events timeline */}
          {lifecycleEvents.length > 0 && (
            <div className="rounded-xl border bg-card p-4">
              <h3 className="mb-3 text-sm font-semibold">Lease events</h3>
              <div className="space-y-3">
                {lifecycleEvents.map((e) => (
                  <div key={e.id} className="flex items-start gap-2.5">
                    <span
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: EVENT_DOT[e.event_type] ?? "#6b7280" }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium capitalize">
                        {e.event_type.replaceAll("_", " ")}
                      </p>
                      {e.description && (
                        <p className="text-[11px] text-muted-foreground">{e.description}</p>
                      )}
                      <p className="text-[11px] text-muted-foreground">
                        {new Date(e.created_at).toLocaleDateString("en-ZA", {
                          day: "numeric", month: "short", year: "numeric",
                        })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
