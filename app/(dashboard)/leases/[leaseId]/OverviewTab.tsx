"use client"

import { useState } from "react"
import Link from "next/link"
import { formatZAR } from "@/lib/constants"
import { ContactCard } from "@/components/contacts/ContactCard"
import { CoTenantAvatars } from "@/components/contacts/CoTenantAvatars"
import { CollectionChart, type MonthBar } from "./CollectionChart"
import type { TenantContactInfo } from "./ContactsTab"

const EVENT_DOT: Record<string, string> = {
  lease_created: "#7F77DD", lease_signed: "#7F77DD", lease_renewed: "#7F77DD",
  deposit_received: "#1D9E75", escalation_processed: "#1D9E75",
  inspection_scheduled: "#378ADD", inspection_completed: "#378ADD",
  notice_given: "#EF9F27", s14_notice_sent: "#EF9F27",
  lease_expired: "#E24B4A", lease_cancelled: "#E24B4A",
}

interface OverviewLease {
  rent_amount_cents: number | null
  start_date: string | null
  end_date: string | null
  deposit_amount_cents: number | null
  deposit_interest_to: string | null
  deposit_interest_rate: number | null
  escalation_percent: number | null
  escalation_review_date: string | null
  payment_due_day: number | null
  is_fixed_term: boolean | null
}

interface OverviewLandlord {
  id: string
  name: string
  company: string | null
  entityType: string | null
  email: string | null
  phone: string | null
  managedBy: string | null
}

interface OverviewTabProps {
  readonly propertyId: string | null
  readonly lease: OverviewLease
  readonly latestInvoice: { balance_cents: number | null } | null
  readonly arrearsCase: { total_arrears_cents: number; months_in_arrears: number | null } | null
  readonly lifecycleEvents: Array<{ id: string; event_type: string; description: string | null; created_at: string }>
  readonly allTenants: TenantContactInfo[]
  readonly landlord: OverviewLandlord | null
  readonly ytdPayments: Array<{ payment_date: string; amount_cents: number }>
  readonly maintenanceCostCents: number
  readonly maintenanceJobCount: number
  readonly upcomingDeadlines: Array<{ dot: string; label: string; value: string | null; overdue?: boolean }>
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function ordinal(n: number): string {
  if (n >= 11 && n <= 13) return `${n}th`
  const s = ["th", "st", "nd", "rd"]
  return `${n}${s[n % 10] ?? "th"}`
}

function formatDays(days: number): string {
  if (days <= 0) return "Expired"
  if (days === 1) return "1 day remaining"
  if (days < 30) return `${days} days remaining`
  const months = Math.floor(days / 30)
  return `${months} month${months === 1 ? "" : "s"} remaining`
}

function daysClass(days: number): string {
  if (days <= 0) return "text-danger"
  if (days <= 90) return "text-warning"
  return "text-brand"
}

function getMonthStatus(isFuture: boolean, collected: number, expected: number): MonthBar["status"] {
  if (isFuture) return "future"
  if (collected >= expected) return "collected"
  if (collected > 0) return "partial"
  return "missed"
}

function buildMonthBars(
  ytdPayments: Array<{ payment_date: string; amount_cents: number }>,
  rentCents: number,
  taxYearStart: Date,
  today: Date,
  leaseStartDate: Date | null,
): MonthBar[] {
  const bars: MonthBar[] = []
  for (let i = 0; i < 12; i++) {
    const d = new Date(taxYearStart.getFullYear(), taxYearStart.getMonth() + i, 1)
    const label = d.toLocaleDateString("en-ZA", { month: "short" })
    // Month before lease start → no expected rent
    const leaseActive = !leaseStartDate || d >= new Date(leaseStartDate.getFullYear(), leaseStartDate.getMonth(), 1)
    const expectedForMonth = leaseActive ? rentCents : 0
    const collected = ytdPayments
      .filter((p) => {
        const pd = new Date(p.payment_date)
        return pd.getFullYear() === d.getFullYear() && pd.getMonth() === d.getMonth()
      })
      .reduce((sum, p) => sum + p.amount_cents, 0)
    bars.push({ month: label, expected: expectedForMonth, collected, status: getMonthStatus(d > today, collected, expectedForMonth) })
  }
  return bars
}

function getTaxYear(today: Date): { start: Date; label: string } {
  const year = today.getMonth() >= 2 ? today.getFullYear() : today.getFullYear() - 1
  return {
    start: new Date(year, 2, 1),
    label: `Mar ${String(year).slice(2)} — Feb ${String(year + 1).slice(2)}`,
  }
}

function buildPeriodText(startDate: string | null, endDate: string | null): string {
  const fmt = (d: string) => new Date(d).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })
  return [startDate ? fmt(startDate) : null, endDate ? fmt(endDate) : null].filter(Boolean).join(" — ")
}

function formatEntityLabel(entityType: string | null): string {
  if (!entityType) return "Individual"
  return entityType.charAt(0).toUpperCase() + entityType.slice(1).replaceAll("_", " ")
}

interface YtdResult {
  ytdCollectedCents: number
  ytdExpectedCents: number
  outstandingCents: number
  collectedPct: number
  depositInterestCents: number | null
  monthsElapsed: number
}

function computeYtd(
  lease: Pick<OverviewLease, "start_date" | "rent_amount_cents" | "deposit_amount_cents" | "deposit_interest_rate">,
  ytdPayments: Array<{ amount_cents: number }>,
  taxYearStart: Date,
  today: Date,
): YtdResult {
  const rentCents = lease.rent_amount_cents ?? 0
  const ytdCollectedCents = ytdPayments.reduce((s, p) => s + p.amount_cents, 0)
  const leaseStartDate = lease.start_date ? new Date(lease.start_date) : taxYearStart
  const countStart = leaseStartDate > taxYearStart ? leaseStartDate : taxYearStart
  const monthsElapsed = Math.max(
    1,
    (today.getFullYear() - countStart.getFullYear()) * 12 + today.getMonth() - countStart.getMonth() + 1,
  )
  const ytdExpectedCents = rentCents * monthsElapsed
  const outstandingCents = Math.max(0, ytdExpectedCents - ytdCollectedCents)
  const collectedPct = ytdExpectedCents > 0 ? Math.round((ytdCollectedCents / ytdExpectedCents) * 100) : 0
  const depositInterestCents = (lease.deposit_amount_cents && lease.deposit_interest_rate)
    ? Math.round(lease.deposit_amount_cents * (lease.deposit_interest_rate / 100) * (monthsElapsed / 12))
    : null
  return { ytdCollectedCents, ytdExpectedCents, outstandingCents, collectedPct, depositInterestCents, monthsElapsed }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function BalanceDisplay({ cents }: { readonly cents: number | null }) {
  if (cents === null) return <p className="text-sm text-muted-foreground">No invoices</p>
  if (cents <= 0) return <p className="text-xl font-heading text-success">R 0 owing</p>
  return <p className="text-xl font-heading text-warning">{formatZAR(cents)} owing</p>
}

function KpiStrip({
  lease,
  balanceCents,
  arrearsCase,
  depositInterestCents,
  daysRemaining,
  periodText,
  rentCents,
}: {
  readonly lease: OverviewLease
  readonly balanceCents: number | null
  readonly arrearsCase: { months_in_arrears: number | null } | null
  readonly depositInterestCents: number | null
  readonly daysRemaining: number | null
  readonly periodText: string
  readonly rentCents: number
}) {
  const arrearsMonths = arrearsCase?.months_in_arrears ?? 0
  const depositSubLabel = lease.deposit_interest_to
    ? `Interest → ${lease.deposit_interest_to.replaceAll("_", " ")}`
    : null
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <div className="rounded-xl border bg-card p-4">
        <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1">Monthly rent</p>
        <p className="text-xl font-heading">{rentCents ? formatZAR(rentCents) : "—"}</p>
        {(lease.payment_due_day ?? lease.escalation_percent) && (
          <p className="text-xs text-muted-foreground mt-1">
            {lease.payment_due_day ? `Due ${ordinal(lease.payment_due_day)}` : ""}
            {lease.payment_due_day && lease.escalation_percent ? " · " : ""}
            {lease.escalation_percent ? `${lease.escalation_percent}% escalation` : ""}
          </p>
        )}
      </div>

      <div className="rounded-xl border bg-card p-4">
        <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1">Lease period</p>
        <p className="text-sm font-bold leading-snug">{periodText || "—"}</p>
        {daysRemaining !== null && (
          <p className={`text-xs mt-1 font-medium ${daysClass(daysRemaining)}`}>
            {formatDays(daysRemaining)}
          </p>
        )}
        {!lease.end_date && (
          <p className="text-xs mt-1 text-muted-foreground">
            {lease.is_fixed_term ? "Fixed term" : "Month to month"}
          </p>
        )}
      </div>

      <div className="rounded-xl border bg-card p-4">
        <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1">Payment status</p>
        <BalanceDisplay cents={balanceCents} />
        {arrearsCase && (
          <p className="text-xs text-danger mt-1 font-medium">
            {`Arrears case · ${arrearsMonths} ${arrearsMonths === 1 ? "month" : "months"}`}
          </p>
        )}
      </div>

      <div className="rounded-xl border bg-card p-4">
        <p className="text-[11px] text-muted-foreground uppercase tracking-wide mb-1">Deposit held</p>
        <p className="text-xl font-heading">
          {lease.deposit_amount_cents ? formatZAR(lease.deposit_amount_cents) : "—"}
        </p>
        {depositSubLabel && (
          <p className="text-xs text-muted-foreground mt-1 capitalize">{depositSubLabel}</p>
        )}
        {depositInterestCents !== null && depositInterestCents > 0 && (
          <p className="text-xs text-muted-foreground">· {formatZAR(depositInterestCents)}</p>
        )}
      </div>
    </div>
  )
}

function YtdSection({
  monthBars,
  taxYearLabel,
  ytdCollectedCents,
  ytdExpectedCents,
  outstandingCents,
  collectedPct,
  depositInterestCents,
  depositInterestTo,
  maintenanceCostCents,
  maintenanceJobCount,
  arrearsCase,
}: {
  readonly monthBars: MonthBar[]
  readonly taxYearLabel: string
  readonly ytdCollectedCents: number
  readonly ytdExpectedCents: number
  readonly outstandingCents: number
  readonly collectedPct: number
  readonly depositInterestCents: number | null
  readonly depositInterestTo: string | null
  readonly maintenanceCostCents: number
  readonly maintenanceJobCount: number
  readonly arrearsCase: { months_in_arrears: number | null } | null
}) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="rounded-xl border bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">Collection history</h3>
          <span className="text-xs text-muted-foreground">Tax year {taxYearLabel}</span>
        </div>
        <CollectionChart data={monthBars} />
        <div className="flex gap-4 mt-2">
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className="h-2 w-2 rounded-sm inline-block" style={{ background: "#378ADD", opacity: 0.6 }} /> Expected
          </span>
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className="h-2 w-2 rounded-sm inline-block bg-[#1D9E75]" /> Collected
          </span>
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className="h-2 w-2 rounded-sm inline-block bg-[#EF9F27]" /> Partial
          </span>
        </div>
      </div>

      <div className="rounded-xl border bg-card p-4">
        <h3 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70 mb-3">
          Lease financials (year to date)
        </h3>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">Total collected</p>
            <p className="text-lg font-heading">{formatZAR(ytdCollectedCents)}</p>
            <p className="text-xs text-muted-foreground">
              of {formatZAR(ytdExpectedCents)} expected ({collectedPct}%)
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">Outstanding</p>
            <p className={`text-lg font-heading ${outstandingCents > 0 ? "text-danger" : "text-success"}`}>
              {formatZAR(outstandingCents > 0 ? outstandingCents : 0)}
            </p>
            {arrearsCase && <p className="text-xs text-danger">Arrears case open</p>}
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">Deposit interest</p>
            <p className="text-lg font-heading">
              {depositInterestCents !== null ? formatZAR(depositInterestCents) : "—"}
            </p>
            {depositInterestTo && (
              <p className="text-xs text-muted-foreground capitalize">
                {depositInterestTo.replaceAll("_", " ")} · accrued YTD
              </p>
            )}
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">Maintenance cost</p>
            <p className="text-lg font-heading">
              {maintenanceCostCents > 0 ? formatZAR(maintenanceCostCents) : "—"}
            </p>
            {maintenanceJobCount > 0 && (
              <p className="text-xs text-muted-foreground">
                {maintenanceJobCount} {maintenanceJobCount === 1 ? "job" : "jobs"}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function OverviewTab({
  propertyId,
  lease,
  latestInvoice,
  arrearsCase,
  lifecycleEvents,
  allTenants,
  landlord,
  ytdPayments,
  maintenanceCostCents,
  maintenanceJobCount,
  upcomingDeadlines,
}: OverviewTabProps) {
  const [activeIdx, setActiveIdx] = useState(0)

  const today = new Date()
  const activeTenant = allTenants[activeIdx] ?? null
  const rentCents = lease.rent_amount_cents ?? 0
  const { start: taxYearStart, label: taxYearLabel } = getTaxYear(today)
  const { ytdCollectedCents, ytdExpectedCents, outstandingCents, collectedPct, depositInterestCents } =
    computeYtd(lease, ytdPayments, taxYearStart, today)
  const leaseStartDate = lease.start_date ? new Date(lease.start_date) : null
  const monthBars = rentCents > 0 ? buildMonthBars(ytdPayments, rentCents, taxYearStart, today, leaseStartDate) : []
  const daysRemaining = lease.end_date
    ? Math.ceil((new Date(lease.end_date).getTime() - today.getTime()) / 86400000)
    : null

  return (
    <div className="space-y-5">
      <KpiStrip
        lease={lease}
        balanceCents={latestInvoice?.balance_cents ?? null}
        arrearsCase={arrearsCase}
        depositInterestCents={depositInterestCents}
        daysRemaining={daysRemaining}
        periodText={buildPeriodText(lease.start_date, lease.end_date)}
        rentCents={rentCents}
      />

      {/* Owner + Tenant contact cards */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">Owner / Landlord</p>
            {landlord?.managedBy && (
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                {`Managed by ${landlord.managedBy}`}
              </p>
            )}
          </div>
          {landlord ? (
            <ContactCard
              name={landlord.name}
              subtitle={`${formatEntityLabel(landlord.entityType)} · Owner`}
              avatarVariant="blue"
              email={landlord.email}
              phone={landlord.phone}
              profileHref={`/landlords/${landlord.id}`}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              No owner linked.{" "}
              {propertyId && (
                <Link href={`/properties/${propertyId}`} className="text-brand hover:underline">Link here</Link>
              )}
            </p>
          )}
        </div>

        <div className="rounded-xl border bg-card p-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70 mb-3">Tenant</p>
          {activeTenant ? (
            <ContactCard
              name={activeTenant.name}
              subtitle={`${formatEntityLabel(activeTenant.entityType)} · ${activeTenant.role}`}
              avatarVariant="brand"
              email={activeTenant.email}
              phone={activeTenant.phone}
              profileHref={activeTenant.tenantId ? `/tenants/${activeTenant.tenantId}` : undefined}
              headerActions={allTenants.length > 1 ? (
                <CoTenantAvatars tenants={allTenants} activeIdx={activeIdx} onSelect={setActiveIdx} />
              ) : undefined}
            />
          ) : (
            <p className="text-sm text-muted-foreground">No tenant linked.</p>
          )}
        </div>
      </div>

      {rentCents > 0 && (
        <YtdSection
          monthBars={monthBars}
          taxYearLabel={taxYearLabel}
          ytdCollectedCents={ytdCollectedCents}
          ytdExpectedCents={ytdExpectedCents}
          outstandingCents={outstandingCents}
          collectedPct={collectedPct}
          depositInterestCents={depositInterestCents}
          depositInterestTo={lease.deposit_interest_to}
          maintenanceCostCents={maintenanceCostCents}
          maintenanceJobCount={maintenanceJobCount}
          arrearsCase={arrearsCase}
        />
      )}

      {/* Recent activity + Upcoming deadlines */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-4">
          <h3 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70 mb-3">Recent activity</h3>
          {lifecycleEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity recorded.</p>
          ) : (
            <div className="space-y-3">
              {lifecycleEvents.slice(0, 5).map((e) => (
                <div key={e.id} className="flex items-start gap-2.5">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: EVENT_DOT[e.event_type] ?? "#6b7280" }} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium capitalize">{e.event_type.replaceAll("_", " ")}</p>
                    {e.description && <p className="text-xs text-muted-foreground">{e.description}</p>}
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {new Date(e.created_at).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border bg-card p-4">
          <h3 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70 mb-3">Upcoming deadlines</h3>
          {upcomingDeadlines.length === 0 ? (
            <p className="text-sm text-muted-foreground">No upcoming deadlines.</p>
          ) : (
            <div className="space-y-3">
              {upcomingDeadlines.map((item, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: item.dot }} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{item.label}</p>
                    {item.value && (
                      <p className={`text-xs ${item.overdue ? "text-danger" : "text-muted-foreground"}`}>
                        {item.value}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
