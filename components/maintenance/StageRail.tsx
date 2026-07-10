/**
 * components/maintenance/StageRail.tsx — 8-stage pipeline visual for maintenance detail
 *
 * Data:   timestamps + current status from server page — no data fetching
 * Notes:  Read-only. Shows done / current / upcoming stages with ISO timestamps.
 *         Truncates at cancellation/rejection point with a terminal cap.
 */

import React from "react"
import { fmtZA } from "@/lib/dates"

interface StageData {
  id: string
  label: string
  when: string | null
  actor?: string | null
}

interface Props {
  currentStatus: string
  createdAt: string
  aiTriageAt: string | null
  reviewedAt: string | null
  reviewedBy: string | null
  workOrderSentAt: string | null
  scheduledDate: string | null
  inProgressAt: string | null
  completedAt: string | null
  closedAt: string | null
}

const STATUS_ORDER = [
  "pending_review", "approved", "work_order_sent", "acknowledged",
  "in_progress", "pending_completion", "completed", "closed",
]

function fmtDate(iso: string | null): string | null {
  if (!iso) return null
  return fmtZA(iso, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
}

export function StageRail({
  currentStatus, createdAt, aiTriageAt, reviewedAt, reviewedBy,
  workOrderSentAt, scheduledDate, inProgressAt, completedAt, closedAt,
}: Readonly<Props>) {
  const isCancelled = currentStatus === "cancelled"
  const isRejected  = currentStatus === "rejected"
  const isTerminal  = isCancelled || isRejected

  const stages: StageData[] = [
    { id: "logged",   label: "Logged",      when: fmtDate(createdAt) },
    { id: "triaged",  label: "Triaged",     when: fmtDate(aiTriageAt), actor: aiTriageAt ? "AI" : null },
    { id: "approved", label: "Approved",    when: fmtDate(reviewedAt), actor: reviewedBy },
    { id: "wo_sent",  label: "WO sent",     when: fmtDate(workOrderSentAt) },
    { id: "scheduled",label: "Scheduled",   when: scheduledDate ? fmtZA(scheduledDate, { weekday: "short", day: "numeric", month: "short" }) : null },
    { id: "in_progress", label: "In progress", when: fmtDate(inProgressAt) },
    { id: "pending_completion", label: "Sign-off", when: null },
    { id: "closed",   label: "Closed",      when: fmtDate(closedAt ?? completedAt) },
  ]

  const currentIdx = STATUS_ORDER.indexOf(currentStatus)

  return (
    <div className="flex items-start border-b border-border overflow-x-auto px-4 py-3 gap-0">
      {stages.map((stage, i) => {
        const isDone = !isTerminal && currentIdx > i
        const isCur  = !isTerminal && currentIdx === i

        let dotCls: string
        if (isDone) dotCls = "bg-success"
        else if (isCur) dotCls = "bg-brand ring-2 ring-brand/40"
        else if (isTerminal && i === currentIdx) dotCls = "bg-danger"
        else dotCls = "border-2 border-border bg-background"

        let labelCls: string
        if (isCur) labelCls = "text-brand font-semibold"
        else if (isDone) labelCls = "text-foreground"
        else labelCls = "text-muted-foreground"

        return (
          <div key={stage.id} className="flex items-start min-w-[100px] flex-1">
            <div className="flex flex-col items-center mr-2">
              <div className={`w-2.5 h-2.5 rounded-full mt-0.5 shrink-0 ${dotCls}`} />
              {i < stages.length - 1 && (
                <div className={`w-px flex-1 mt-1 min-h-[20px] ${isDone || isCur ? "bg-success/40" : "bg-border"}`} />
              )}
            </div>
            <div className="flex flex-col pb-3">
              <span className={`text-xs font-medium leading-tight ${labelCls}`}>
                {stage.label}
              </span>
              {stage.when && (
                <span className="text-[10px] text-muted-foreground font-mono leading-tight mt-0.5">{stage.when}</span>
              )}
              {stage.actor && (
                <span className="text-[10px] text-muted-foreground leading-tight">{stage.actor}</span>
              )}
            </div>
          </div>
        )
      })}
      {isTerminal && (
        <div className="flex flex-col items-center ml-2 mt-0.5">
          <div className={`w-2.5 h-2.5 rounded-full ${isCancelled ? "bg-danger" : "bg-warning"}`} />
          <span className="text-[10px] font-medium text-danger mt-1">{isCancelled ? "CANCELLED" : "REJECTED"}</span>
        </div>
      )}
    </div>
  )
}
