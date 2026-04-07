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

interface OwnerMetricsProps {
  unitStatus: string | null
  rentCents: number | null
  leaseEndDate: string | null
  collectionPct: number | null
}

export function OwnerMetrics({ unitStatus, rentCents, leaseEndDate, collectionPct }: OwnerMetricsProps) {
  const statusLabel = unitStatus === "occupied" ? "Occupied"
    : unitStatus === "notice" ? "Notice given"
    : unitStatus === "vacant" ? "Vacant"
    : "—"
  const statusClass = unitStatus === "occupied" ? "text-green-500"
    : unitStatus === "notice" ? "text-amber-500"
    : "text-red-500"

  let leaseLabel = "No active lease"
  if (leaseEndDate) {
    const days = Math.ceil((new Date(leaseEndDate).getTime() - Date.now()) / 86400000)
    if (days < 0) leaseLabel = "Expired"
    else if (days <= 31) leaseLabel = `${days} days`
    else leaseLabel = `${Math.ceil(days / 30)} months`
  }

  const collLabel = collectionPct == null ? "Pending"
    : collectionPct >= 100 ? "100%"
    : `${collectionPct}%`
  const collClass = collectionPct == null ? "text-amber-500"
    : collectionPct >= 100 ? "text-green-500"
    : "text-red-500"

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

interface PortfolioMetricsProps {
  propertyCount: number
  occupancyPct: number
  rentRollCents: number
  attentionCount: number
}

export function PortfolioMetrics({ propertyCount, occupancyPct, rentRollCents, attentionCount }: PortfolioMetricsProps) {
  const occClass = occupancyPct >= 90 ? "text-green-500"
    : occupancyPct >= 70 ? "text-amber-500"
    : "text-red-500"

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
