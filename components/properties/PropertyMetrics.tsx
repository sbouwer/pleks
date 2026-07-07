/**
 * components/properties/PropertyMetrics.tsx — KPI tiles for a property/unit (rent, lease time remaining, this-month invoice status)
 *
 * Notes:  Presentational. Derives labels (lease remaining, this-month collection) from passed-in lease/invoice data.
 */
import { formatZARAbbrev } from "@/lib/constants"
import { cn } from "@/lib/utils"
import { MetricCard as KpiCard } from "@/components/ui/metric-card"

interface MetricCardProps {
  label: string
  value: string
  sub?: string
  valueClass?: string
}

function MetricCard({ label, value, sub, valueClass }: MetricCardProps) {
  return (
    <div className="rounded-xl border border-border/60 bg-surface-elevated px-4 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/70 mb-1">{label}</p>
      <p className={cn("text-xl font-semibold", valueClass)}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  )
}

// ── Owner metrics (single unit) ───────────────────────────────────────────────

function leaseRemainingLabel(endDate: string | null): string {
  if (!endDate) return "No active lease"
  const days = Math.ceil((new Date(endDate).getTime() - Date.now()) / 86400000)
  if (days < 0) return "Expired"
  if (days === 0) return "Last day"
  if (days <= 31) return `${days} days`
  const months = Math.ceil(days / 30)
  return `${months} month${months !== 1 ? "s" : ""}`
}

function thisMonthLabel(
  invoice: { total_amount_cents: number; amount_paid_cents: number | null; due_date: string } | null,
  unitStatus: string | null
): { label: string; cls: string; sub?: string } {
  if (!unitStatus || unitStatus === "vacant") return { label: "No income", cls: "text-muted-foreground" }
  if (!invoice) return { label: "No invoice", cls: "text-muted-foreground" }
  const total = invoice.total_amount_cents
  const paid = invoice.amount_paid_cents ?? 0
  const due = new Date(invoice.due_date)
  if (paid >= total) return { label: `${formatZARAbbrev(total)} paid`, cls: "text-green-500" }
  if (Date.now() > due.getTime()) return { label: `${formatZARAbbrev(total)} overdue`, cls: "text-red-500" }
  return {
    label: `${formatZARAbbrev(total)} due`,
    cls: "text-amber-500",
    sub: `on ${due.toLocaleDateString("en-ZA", { day: "numeric", month: "short" })}`,
  }
}

interface CurrentInvoice {
  total_amount_cents: number
  amount_paid_cents: number | null
  due_date: string
}

interface OwnerMetricsProps {
  readonly unitStatus: string | null
  readonly leaseEndDate: string | null
  readonly currentInvoice: CurrentInvoice | null
}

const STATUS_LABEL: Record<string, string> = {
  occupied: "Occupied",
  notice: "Notice given",
  vacant: "Vacant",
}
const STATUS_CLASS: Record<string, string> = {
  occupied: "text-green-500",
  notice: "text-amber-500",
}

export function OwnerMetrics({ unitStatus, leaseEndDate, currentInvoice }: OwnerMetricsProps) {
  const statusLabel = (unitStatus && STATUS_LABEL[unitStatus]) ?? "—"
  const statusClass = (unitStatus && STATUS_CLASS[unitStatus]) ?? "text-red-500"
  const leaseLabel = leaseRemainingLabel(leaseEndDate)
  const thisMonth = thisMonthLabel(currentInvoice, unitStatus)

  return (
    <div className="grid grid-cols-3 gap-3 mb-5">
      <MetricCard label="Status" value={statusLabel} valueClass={statusClass} />
      <MetricCard label="This month" value={thisMonth.label} valueClass={thisMonth.cls} sub={thisMonth.sub} />
      <MetricCard label="Lease remaining" value={leaseLabel} />
    </div>
  )
}

// ── Steward metrics (portfolio summary) ──────────────────────────────────────

interface PortfolioMetricsProps {
  readonly propertyCount: number
  readonly unitCount: number
  readonly occupiedUnits: number
  readonly occupancyPct: number
  readonly rentRollCents: number
  /** potential income = in-force rent where let + asking rent on vacant units. */
  readonly potentialCents?: number
  /** % of due rent currently unpaid (org-wide). */
  readonly arrearsPct?: number
}

/** Connected KPI strip (same panel style as the dashboard) for the properties list. */
export function PortfolioMetrics({ propertyCount, unitCount, occupiedUnits, occupancyPct, rentRollCents, potentialCents, arrearsPct = 0 }: PortfolioMetricsProps) {
  const vacant = Math.max(0, unitCount - occupiedUnits)
  const unitWord = unitCount === 1 ? "unit" : "units"
  let occDot = "#EF4444"
  if (occupancyPct >= 90) occDot = "#1D9E75"
  else if (occupancyPct >= 70) occDot = "#EF9F27"
  const hasArrears = arrearsPct > 0

  return (
    <div className="mb-5 grid grid-cols-2 overflow-hidden rounded-[var(--r-button)] border border-border border-b-2 border-b-primary md:grid-cols-4">
      <KpiCard label="Properties" value={String(propertyCount)} subtext={`${unitCount} ${unitWord}`} className="border-b border-r border-border md:border-b-0" />
      <KpiCard label="Occupancy" value={`${occupancyPct}%`} subtext={vacant > 0 ? `${occupiedUnits} rented · ${vacant} vacant` : "Fully occupied"} subtextVariant={vacant > 0 ? "warning" : "success"} dotColor={occDot} className="border-b border-border md:border-b-0 md:border-r" />
      <KpiCard label="Rent roll" value={formatZARAbbrev(rentRollCents)} subtext={potentialCents != null ? `${formatZARAbbrev(potentialCents)} potential` : "per month"} className="border-r border-border" />
      <KpiCard label="Arrears" value={`${arrearsPct}%`} subtext={hasArrears ? "of rent overdue" : "Fully collected"} subtextVariant={hasArrears ? "danger" : "success"} dotColor={hasArrears ? "#EF4444" : "#1D9E75"} />
    </div>
  )
}
