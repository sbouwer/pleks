import { formatZAR } from "@/lib/constants"

const EVENT_DOT: Record<string, string> = {
  lease_created: "#7F77DD", lease_signed: "#7F77DD", lease_renewed: "#7F77DD",
  deposit_received: "#1D9E75", escalation_processed: "#1D9E75",
  inspection_scheduled: "#378ADD", inspection_completed: "#378ADD",
  notice_given: "#EF9F27", s14_notice_sent: "#EF9F27",
  lease_expired: "#E24B4A", lease_cancelled: "#E24B4A",
}

interface OverviewTabProps {
  lease: {
    rent_amount_cents: number | null
    start_date: string | null
    end_date: string | null
    deposit_amount_cents: number | null
    deposit_interest_to: string | null
    escalation_percent: number | null
    payment_due_day: number | null
    is_fixed_term: boolean | null
  }
  latestInvoice: { balance_cents: number | null } | null
  arrearsCase: { total_arrears_cents: number; months_in_arrears: number | null; status: string } | null
  tenantDisplayText: string
  tenantEmail: string | null
  tenantPhone: string | null
  landlordName: string | null
  landlordId: string | null
  lifecycleEvents: Array<{ id: string; event_type: string; description: string | null; created_at: string }>
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

function BalanceDisplay({ cents }: { readonly cents: number | null }) {
  if (cents === null) return <p className="text-sm text-muted-foreground">No invoices</p>
  if (cents <= 0) return <p className="text-xl font-heading text-success">R 0 owing</p>
  return <p className="text-xl font-heading text-warning">{formatZAR(cents)} owing</p>
}

export function OverviewTab({
  lease,
  latestInvoice,
  arrearsCase,
  tenantDisplayText,
  tenantEmail,
  tenantPhone,
  landlordName,
  landlordId,
  lifecycleEvents,
}: OverviewTabProps) {
  const balanceCents = latestInvoice?.balance_cents ?? null
  const today = new Date()
  const daysRemaining = lease.end_date
    ? Math.ceil((new Date(lease.end_date).getTime() - today.getTime()) / 86400000)
    : null

  const periodText = [
    lease.start_date ? new Date(lease.start_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" }) : null,
    lease.end_date ? new Date(lease.end_date).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" }) : null,
  ].filter(Boolean).join(" — ")

  const arrearsMonths = arrearsCase?.months_in_arrears ?? 0
  const arrearsPlural = arrearsMonths === 1 ? "" : "s"
  const arrearsLabel = arrearsMonths > 0 ? ` · ${arrearsMonths} month${arrearsPlural}` : ""

  return (
    <div className="space-y-6">
      {/* 4-card summary strip */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {/* Card 1: Monthly rent */}
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Monthly rent</p>
          <p className="text-xl font-heading">{lease.rent_amount_cents ? formatZAR(lease.rent_amount_cents) : "—"}</p>
          {(lease.payment_due_day || lease.escalation_percent) && (
            <p className="text-xs text-muted-foreground mt-1">
              {lease.payment_due_day ? `Due ${ordinal(lease.payment_due_day)}` : ""}
              {lease.payment_due_day && lease.escalation_percent ? " · " : ""}
              {lease.escalation_percent ? `${lease.escalation_percent}% escalation` : ""}
            </p>
          )}
        </div>

        {/* Card 2: Lease period */}
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Lease period</p>
          <p className="text-sm font-medium leading-snug">{periodText || "—"}</p>
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

        {/* Card 3: Payment status */}
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Payment status</p>
          <BalanceDisplay cents={balanceCents} />
          {arrearsCase && (
            <p className="text-xs text-danger mt-1 font-medium">
              {`Arrears case open${arrearsLabel}`}
            </p>
          )}
        </div>

        {/* Card 4: Deposit held */}
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Deposit held</p>
          <p className="text-xl font-heading">{lease.deposit_amount_cents ? formatZAR(lease.deposit_amount_cents) : "—"}</p>
          {lease.deposit_interest_to && (
            <p className="text-xs text-muted-foreground mt-1 capitalize">
              Interest → {lease.deposit_interest_to.replaceAll("_", " ")}
            </p>
          )}
        </div>
      </div>

      {/* Two-column: Tenant + Owner */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Tenant card */}
        <div className="rounded-xl border bg-card p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-3">Tenant</p>
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 shrink-0 rounded-full bg-brand/20 text-sm font-semibold text-brand flex items-center justify-center">
              {tenantDisplayText.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium truncate">{tenantDisplayText}</p>
              <div className="flex gap-3 mt-0.5">
                {tenantPhone && (
                  <a href={`tel:${tenantPhone}`} className="text-xs text-muted-foreground hover:text-foreground truncate">
                    {tenantPhone}
                  </a>
                )}
                {tenantEmail && (
                  <a href={`mailto:${tenantEmail}`} className="text-xs text-muted-foreground hover:text-foreground truncate">
                    {tenantEmail}
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Owner card */}
        <div className="rounded-xl border bg-card p-4">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-3">Owner</p>
          {landlordName ? (
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 shrink-0 rounded-full bg-surface-elevated text-sm font-semibold flex items-center justify-center">
                {landlordName.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                {landlordId ? (
                  <a href={`/landlords/${landlordId}`} className="font-medium hover:underline truncate block">
                    {landlordName}
                  </a>
                ) : (
                  <p className="font-medium truncate">{landlordName}</p>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No owner linked.</p>
          )}
        </div>
      </div>

      {/* Recent activity */}
      {lifecycleEvents.length > 0 && (
        <div className="rounded-xl border bg-card p-4">
          <h3 className="text-sm font-semibold mb-3">Recent activity</h3>
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
        </div>
      )}
    </div>
  )
}
