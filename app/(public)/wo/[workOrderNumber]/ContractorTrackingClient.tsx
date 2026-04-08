"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CheckCircle2, Truck, ClipboardCheck, Calendar, XCircle, Loader2 } from "lucide-react"
import { toast } from "sonner"

interface Props {
  requestId: string
  workOrderNumber: string
  token: string
  currentStatus: string
}

const STATUS_LABELS: Record<string, string> = {
  work_order_sent: "Work order received",
  acknowledged: "Acknowledged",
  in_progress: "In progress",
  pending_completion: "Awaiting sign-off",
  completed: "Completed",
  closed: "Closed",
}

export function ContractorTrackingClient({ requestId, workOrderNumber, token, currentStatus: initialStatus }: Readonly<Props>) {
  const [status, setStatus] = useState(initialStatus)
  const [submitting, setSubmitting] = useState<string | null>(null)
  const [completionNotes, setCompletionNotes] = useState("")
  const [actualCost, setActualCost] = useState("")
  const [rescheduleReason, setRescheduleReason] = useState("")
  const [declineReason, setDeclineReason] = useState("")
  const [showCompletion, setShowCompletion] = useState(false)
  const [showReschedule, setShowReschedule] = useState(false)
  const [showDecline, setShowDecline] = useState(false)
  const [done, setDone] = useState(false)

  async function postUpdate(newStatus: string, payload: Record<string, string> = {}) {
    setSubmitting(newStatus)
    try {
      const res = await fetch(`/api/wo/${workOrderNumber}/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, token, new_status: newStatus, ...payload }),
      })
      if (!res.ok) {
        toast.error("Could not update status — please try again")
        return
      }
      setStatus(newStatus)
      if (newStatus === "pending_completion") setDone(true)
    } catch {
      toast.error("Could not update status — please check your connection")
    } finally {
      setSubmitting(null)
    }
  }

  const isTerminal = ["completed", "closed", "cancelled", "rejected"].includes(status)

  if (done) {
    return (
      <div className="rounded-xl border border-success/30 bg-success/5 px-5 py-6 text-center space-y-2">
        <CheckCircle2 className="h-10 w-10 text-success mx-auto" />
        <p className="font-semibold text-lg">Completion report submitted</p>
        <p className="text-sm text-muted-foreground">The property manager has been notified and will sign off on the job.</p>
      </div>
    )
  }

  if (isTerminal) {
    return (
      <div className="rounded-xl border border-border/60 bg-surface-elevated px-5 py-4 text-center">
        <p className="text-sm text-muted-foreground">This job is {status.replace(/_/g, " ")}.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-border/60 bg-surface-elevated px-5 py-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70 mb-0.5">Current status</p>
        <p className="text-sm font-medium">{STATUS_LABELS[status] ?? status.replace(/_/g, " ")}</p>
      </div>

      {/* Acknowledge — shown if work_order_sent */}
      {status === "work_order_sent" && (
        <button
          type="button"
          disabled={!!submitting}
          onClick={() => postUpdate("acknowledged")}
          className="w-full flex items-center justify-center gap-2.5 rounded-xl border-2 border-brand bg-brand/5 px-5 py-4 text-sm font-semibold text-brand hover:bg-brand/10 transition-colors disabled:opacity-50"
        >
          {submitting === "acknowledged" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
          I&apos;ve received this — confirm
        </button>
      )}

      {/* On my way / starting work — shown if acknowledged */}
      {(status === "acknowledged") && (
        <button
          type="button"
          disabled={!!submitting}
          onClick={() => postUpdate("in_progress")}
          className="w-full flex items-center justify-center gap-2.5 rounded-xl border-2 border-info bg-info/5 px-5 py-4 text-sm font-semibold text-info hover:bg-info/10 transition-colors disabled:opacity-50"
        >
          {submitting === "in_progress" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-5 w-5" />}
          On my way / starting work
        </button>
      )}

      {/* Complete — shown if in_progress or acknowledged */}
      {(status === "in_progress" || status === "acknowledged") && !showCompletion && (
        <button
          type="button"
          onClick={() => setShowCompletion(true)}
          className="w-full flex items-center justify-center gap-2.5 rounded-xl border-2 border-success bg-success/5 px-5 py-4 text-sm font-semibold text-success hover:bg-success/10 transition-colors"
        >
          <ClipboardCheck className="h-5 w-5" />
          Work complete — submit report
        </button>
      )}

      {showCompletion && (
        <div className="rounded-xl border border-success/30 bg-surface-elevated px-5 py-4 space-y-3">
          <p className="text-sm font-semibold">Completion report</p>
          <div className="space-y-1.5">
            <Label className="text-xs">What was done *</Label>
            <Textarea
              value={completionNotes}
              onChange={(e) => setCompletionNotes(e.target.value)}
              rows={3}
              placeholder="Describe what was repaired or replaced…"
              className="resize-none text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Total cost incl. VAT (R)</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={actualCost}
              onChange={(e) => setActualCost(e.target.value)}
              placeholder="0.00"
              className="text-sm"
            />
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              disabled={!completionNotes.trim() || !!submitting}
              onClick={() => postUpdate("pending_completion", {
                completion_notes: completionNotes,
                actual_cost: actualCost,
              })}
            >
              {submitting === "pending_completion" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
              Submit report
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setShowCompletion(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Reschedule */}
      {!showReschedule && !showDecline && (
        <button
          type="button"
          onClick={() => setShowReschedule(true)}
          className="w-full flex items-center justify-center gap-2.5 rounded-xl border border-border/60 bg-surface-elevated px-5 py-3.5 text-sm text-muted-foreground hover:text-foreground hover:border-border transition-colors"
        >
          <Calendar className="h-4.5 w-4.5" />
          Need to reschedule
        </button>
      )}
      {showReschedule && (
        <div className="rounded-xl border border-border/60 bg-surface-elevated px-5 py-4 space-y-3">
          <p className="text-sm font-medium">Reschedule reason</p>
          <Textarea
            value={rescheduleReason}
            onChange={(e) => setRescheduleReason(e.target.value)}
            rows={2}
            placeholder="e.g. Part on back order — available Friday"
            className="resize-none text-sm"
          />
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!rescheduleReason.trim() || !!submitting}
              onClick={() => postUpdate("acknowledged", { reschedule_notes: rescheduleReason })}
            >
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
              Notify agent
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setShowReschedule(false)}>Cancel</Button>
          </div>
        </div>
      )}

      {/* Decline */}
      {!showReschedule && !showDecline && (
        <button
          type="button"
          onClick={() => setShowDecline(true)}
          className="w-full flex items-center justify-center gap-2.5 rounded-xl border border-border/60 bg-surface-elevated px-5 py-3.5 text-sm text-muted-foreground hover:text-danger hover:border-danger/30 transition-colors"
        >
          <XCircle className="h-4.5 w-4.5" />
          Cannot complete — please reassign
        </button>
      )}
      {showDecline && (
        <div className="rounded-xl border border-danger/20 bg-surface-elevated px-5 py-4 space-y-3">
          <p className="text-sm font-medium">Reason for declining</p>
          <Textarea
            value={declineReason}
            onChange={(e) => setDeclineReason(e.target.value)}
            rows={2}
            placeholder="e.g. Outside our speciality — recommend a structural engineer"
            className="resize-none text-sm"
          />
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!declineReason.trim() || !!submitting}
              onClick={() => postUpdate("approved", { decline_notes: declineReason })}
            >
              {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
              Decline job
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setShowDecline(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  )
}
