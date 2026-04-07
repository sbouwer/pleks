import { formatZARAbbrev } from "@/lib/constants"
import { cn } from "@/lib/utils"

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

function occupancyClass(pct: number): string {
  if (pct >= 90) return "text-green-500"
  if (pct >= 70) return "text-amber-500"
  return "text-red-500"
}

interface PortfolioMetricsProps {
  readonly propertyCount: number
  readonly occupancyPct: number
  readonly rentRollCents: number
  readonly attentionCount: number
}

export function PortfolioMetrics({ propertyCount, occupancyPct, rentRollCents, attentionCount }: PortfolioMetricsProps) {
  const occClass = occupancyClass(occupancyPct)

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
      <MetricCard label="Properties" value={String(propertyCount)} />
      <MetricCard label="Occupancy" value={`${occupancyPct}%`} valueClass={occClass} />
      <MetricCard label="Rent roll" value={formatZARAbbrev(rentRollCents)} sub="per month" />
      <MetricCard
        label="Attention"
        value={String(attentionCount)}
        valueClass={attentionCount > 0 ? "text-amber-500" : undefined}
      />
    </div>
  )
}
