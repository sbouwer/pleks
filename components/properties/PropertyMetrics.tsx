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
  if (days <= 31) return `${days} days`
  return `${Math.ceil(days / 30)} months`
}

interface OwnerMetricsProps {
  readonly unitStatus: string | null
  readonly rentCents: number | null
  readonly leaseEndDate: string | null
  readonly collectionPct: number | null
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

function collectionLabel(pct: number | null): string {
  if (pct == null) return "Pending"
  if (pct >= 100) return "100%"
  return `${pct}%`
}

function collectionClass(pct: number | null): string {
  if (pct == null) return "text-amber-500"
  if (pct >= 100) return "text-green-500"
  return "text-red-500"
}

export function OwnerMetrics({ unitStatus, rentCents, leaseEndDate, collectionPct }: OwnerMetricsProps) {
  const statusLabel = (unitStatus && STATUS_LABEL[unitStatus]) ?? "—"
  const statusClass = (unitStatus && STATUS_CLASS[unitStatus]) ?? "text-red-500"
  const leaseLabel = leaseRemainingLabel(leaseEndDate)
  const collLabel = collectionLabel(collectionPct)
  const collClass = collectionClass(collectionPct)

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
      <MetricCard label="Status" value={statusLabel} valueClass={statusClass} />
      <MetricCard label="Rent" value={rentCents ? formatZARAbbrev(rentCents) : "—"} sub="per month" />
      <MetricCard label="Lease remaining" value={leaseLabel} />
      <MetricCard label="Collection" value={collLabel} valueClass={collClass} sub="this month" />
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
