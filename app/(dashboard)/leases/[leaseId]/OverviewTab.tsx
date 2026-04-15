import { formatZAR } from "@/lib/constants"
import { ContactCard } from "@/components/contacts/ContactCard"
import { CollectionChart, type MonthBar } from "./CollectionChart"

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

interface OverviewTenant {
  name: string
  subtitle: string
  email: string | null
  phone: string | null
  tenantId: string | null
}

interface OverviewLandlord {
  id: string
  name: string
  company: string | null
  email: string | null
  phone: string | null
}

interface OverviewTabProps {
  lease: OverviewLease
  latestInvoice: { balance_cents: number | null } | null
  arrearsCase: { total_arrears_cents: number; months_in_arrears: number | null } | null
  lifecycleEvents: Array<{ id: string; event_type: string; description: string | null; created_at: string }>
  tenant: OverviewTenant | null
  landlord: OverviewLandlord | null
  ytdPayments: Array<{ payment_date: string; amount_cents: number }>
  maintenanceCostCents: number
  maintenanceJobCount: number
  upcomingDeadlines: Array<{ dot: string; label: string; value: string | null; overdue?: boolean }>
}

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
  const plural = months === 1 ? "" : "s"
  return `${months} month${plural} remaining`
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
): MonthBar[] {
  const bars: MonthBar[] = []
  for (let i = 0; i < 12; i++) {
    const d = new Date(taxYearStart.getFullYear(), taxYearStart.getMonth() + i, 1)
    const label = d.toLocaleDateString("en-ZA", { month: "short" })
    const collected = ytdPayments
      .filter((p) => {
        const pd = new Date(p.payment_date)
        return pd.getFullYear() === d.getFullYear() && pd.getMonth() === d.getMonth()
      })
      .reduce((sum, p) => sum + p.amount_cents, 0)
    const isFuture = d > today
    bars.push({
      month: label,
      expected: rentCents,
      collected,
      status: getMonthStatus(isFuture, collected, rentCents),
    })
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

function BalanceDisplay({ cents }: { readonly cents: number | null }) {
  if (cents === null) return <p className="text-sm text-muted-foreground">No invoices</p>
  if (cents <= 0) return <p className="text-xl font-heading text-success">R 0 owing</p>
  return <p className="text-xl font-heading text-warning">{formatZAR(cents)} owing</p>
}

export function OverviewTab({
  lease,
  latestInvoice,
  arrearsCase,
  lifecycleEvents,
  tenant,
  landlord,
  ytdPayments,
  maintenanceCostCents,
  maintenanceJobCount,
  upcomingDeadlines,
}: OverviewTabProps) {
  const balanceCents = latestInvoice?.balance_cents ?? null
  const today = new Date()
  const daysRemaining = lease.end_date
    ? Math.ceil((new Date(lease.end_date).getTime() - today.getTime()) / 86400000)
    : null
  const periodText = buildPeriodText(lease.start_date, lease.end_date)

  const arrearsMonths = arrearsCase?.months_in_arrears ?? 0
  const arrearsMonthLabel = arrearsMonths === 1 ? "month" : "months"

  const depositSubLabel = lease.deposit_interest_to
    ? `Interest → ${lease.deposit_interest_to.replaceAll("_", " ")}`
    : null

  const { start: taxYearStart, label: taxYearLabel } = getTaxYear(today)
  const rentCents = lease.rent_amount_cents ?? 0
  const { ytdCollectedCents, ytdExpectedCents, outstandingCents, collectedPct, depositInterestCents } = computeYtd(lease, ytdPayments, taxYearStart, today)
  const monthBars = rentCents > 0 ? buildMonthBars(ytdPayments, rentCents, taxYearStart, today) : []

  return (
    <div className="space-y-5">
      {/* 4-card KPI strip */}
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
              {`Arrears case · ${arrearsMonths} ${arrearsMonthLabel}`}
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

      {/* Tenant + Owner contact cards */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70 mb-3">Tenant</p>
          {tenant ? (
            <ContactCard
              name={tenant.name}
              subtitle={tenant.subtitle}
              avatarVariant="brand"
              email={tenant.email}
              phone={tenant.phone}
              profileHref={tenant.tenantId ? `/tenants/${tenant.tenantId}` : undefined}
            />
          ) : (
            <p className="text-sm text-muted-foreground">No tenant linked.</p>
          )}
        </div>

        <div className="rounded-xl border bg-card p-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70 mb-3">Owner</p>
          {landlord ? (
            <ContactCard
              name={landlord.name}
              subtitle={landlord.company ?? "Self-managed"}
              avatarVariant="blue"
              email={landlord.email}
              phone={landlord.phone}
              profileHref={`/landlords/${landlord.id}`}
            />
          ) : (
            <p className="text-sm text-muted-foreground">No owner linked.</p>
          )}
        </div>
      </div>

      {/* Collection history + Financials YTD */}
      {rentCents > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Chart */}
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">Collection history</h3>
              <span className="text-xs text-muted-foreground">Tax year {taxYearLabel}</span>
            </div>
            <CollectionChart data={monthBars} />
            <div className="flex gap-4 mt-2">
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <span className="h-2 w-2 rounded-sm inline-block" style={{ background: "#4B5563", opacity: 0.4 }} />
                Expected
              </span>
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <span className="h-2 w-2 rounded-sm inline-block bg-[#1D9E75]" />
                Collected
              </span>
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <span className="h-2 w-2 rounded-sm inline-block bg-[#EF9F27]" />
                Partial
              </span>
            </div>
          </div>

          {/* Financials 2×2 grid */}
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
                  {outstandingCents > 0 ? formatZAR(outstandingCents) : formatZAR(0)}
                </p>
                {arrearsCase && (
                  <p className="text-xs text-danger">Arrears case open</p>
                )}
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">Deposit interest</p>
                <p className="text-lg font-heading">
                  {depositInterestCents !== null ? formatZAR(depositInterestCents) : "—"}
                </p>
                {lease.deposit_interest_to && (
                  <p className="text-xs text-muted-foreground capitalize">
                    {lease.deposit_interest_to.replaceAll("_", " ")} · accrued YTD
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
      )}

      {/* Recent activity + Upcoming deadlines */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Recent activity */}
        <div className="rounded-xl border bg-card p-4">
          <h3 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70 mb-3">Recent activity</h3>
          {lifecycleEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity recorded.</p>
          ) : (
            <div className="space-y-3">
              {lifecycleEvents.slice(0, 5).map((e) => (
                <div key={e.id} className="flex items-start gap-2.5">
                  <span
                    className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: EVENT_DOT[e.event_type] ?? "#6b7280" }}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium capitalize">{e.event_type.replaceAll("_", " ")}</p>
                    {e.description && (
                      <p className="text-xs text-muted-foreground">{e.description}</p>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {new Date(e.created_at).toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Upcoming deadlines */}
        <div className="rounded-xl border bg-card p-4">
          <h3 className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70 mb-3">Upcoming deadlines</h3>
          {upcomingDeadlines.length === 0 ? (
            <p className="text-sm text-muted-foreground">No upcoming deadlines.</p>
          ) : (
            <div className="space-y-3">
              {upcomingDeadlines.map((item, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <span
                    className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: item.dot }}
                  />
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
