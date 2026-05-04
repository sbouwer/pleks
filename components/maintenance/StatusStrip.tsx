/**
 * components/maintenance/StatusStrip.tsx — 5-cell status overview strip for maintenance detail
 *
 * Data:   all props passed from server page — no data fetching
 * Notes:  Read-only. Mirrors the design spec status strip: Status / Contractor / Scheduled / Cost / Age.
 */

import React from "react"
import { formatZAR } from "@/lib/constants"

interface Props {
  status: string
  contractorName: string | null
  scheduledDate: string | null
  scheduledTimeFrom: string | null
  scheduledTimeTo: string | null
  estimatedCostCents: number | null
  actualCostCents: number | null
  createdAt: string
  delayCount: number
  firstDelayReason: string | null
}

const STATUS_CHIP: Record<string, { label: string; cls: string }> = {
  pending_review:      { label: "Pending review",   cls: "bg-warning/15 text-warning" },
  approved:            { label: "Approved",          cls: "bg-success/15 text-success" },
  work_order_sent:     { label: "WO sent",           cls: "bg-brand/15 text-brand" },
  acknowledged:        { label: "Acknowledged",      cls: "bg-brand/15 text-brand" },
  in_progress:         { label: "In progress",       cls: "bg-info/15 text-info" },
  pending_completion:  { label: "Pending sign-off",  cls: "bg-warning/15 text-warning" },
  completed:           { label: "Completed",         cls: "bg-success/15 text-success" },
  closed:              { label: "Closed",            cls: "bg-muted text-muted-foreground" },
  rejected:            { label: "Rejected",          cls: "bg-danger/15 text-danger" },
  cancelled:           { label: "Cancelled",         cls: "bg-danger/15 text-danger" },
}

function age(from: string): string {
  const ms = Date.now() - new Date(from).getTime()
  const h = Math.floor(ms / 3600000)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  return `${d}d ${h % 24}h`
}

function buildTimeRange(scheduledDate: string | null, from: string | null, to: string | null): string | null {
  if (!scheduledDate) return null
  const label = new Date(scheduledDate).toLocaleDateString("en-ZA", { weekday: "short", day: "numeric", month: "short" })
  if (!from) return label
  const toSuffix = to ? `–${to}` : ""
  return `${label} · ${from}${toSuffix}`
}

function buildCostDisplay(est: number | null, actual: number | null): React.ReactNode {
  if (actual) {
    const isOver = est && actual > est
    return (
      <>
        <span className="font-mono text-muted-foreground">{est ? formatZAR(est) : "—"}</span>
        <span className="text-muted-foreground/40 mx-1">/</span>
        <span className={`font-mono ${isOver ? "text-danger" : ""}`}>{formatZAR(actual)}</span>
      </>
    )
  }
  if (est) return <span className="font-mono">{formatZAR(est)}</span>
  return <span className="text-muted-foreground">—</span>
}

function buildCostSub(est: number | null, actual: number | null): string | undefined {
  if (actual && est && actual > est) return `+${formatZAR(actual - est)} over estimate`
  return undefined
}

function buildDelaySub(count: number, reason: string | null): string | undefined {
  if (count === 0) return undefined
  const plural = count === 1 ? "delay" : "delays"
  return reason ? `${count} ${plural} · ${reason}` : `${count} ${plural}`
}

function Cell({ label, main, sub }: Readonly<{ label: string; main: React.ReactNode; sub?: string }>) {
  return (
    <div className="flex flex-col gap-0.5 px-4 py-3 min-w-0 flex-1">
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">{label}</span>
      <span className="text-sm font-medium truncate">{main}</span>
      {sub && <span className="text-xs text-muted-foreground truncate">{sub}</span>}
    </div>
  )
}

export function StatusStrip({
  status, contractorName, scheduledDate, scheduledTimeFrom, scheduledTimeTo,
  estimatedCostCents, actualCostCents, createdAt, delayCount, firstDelayReason,
}: Readonly<Props>) {
  const chip = STATUS_CHIP[status] ?? { label: status.replaceAll("_", " "), cls: "bg-muted text-muted-foreground" }
  const timeRange = buildTimeRange(scheduledDate, scheduledTimeFrom, scheduledTimeTo)
  const costDisplay = buildCostDisplay(estimatedCostCents, actualCostCents)
  const costSub = buildCostSub(estimatedCostCents, actualCostCents)
  const delaySub = buildDelaySub(delayCount, firstDelayReason)

  return (
    <div className="flex border-y border-border divide-x divide-border overflow-x-auto">
      <Cell
        label="Status"
        main={<span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${chip.cls}`}><span className="w-1.5 h-1.5 rounded-full bg-current" />{chip.label}</span>}
      />
      <Cell
        label="Contractor"
        main={contractorName ?? <span className="text-muted-foreground">Unassigned</span>}
      />
      <Cell
        label="Scheduled"
        main={timeRange ?? <span className="text-muted-foreground">Not scheduled</span>}
      />
      <Cell label="Cost · est / actual" main={costDisplay} sub={costSub} />
      <Cell
        label="Age · delays"
        main={<span className="font-mono">{age(createdAt)}</span>}
        sub={delaySub}
      />
    </div>
  )
}
