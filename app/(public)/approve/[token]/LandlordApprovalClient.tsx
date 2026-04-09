"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { CheckCircle2, XCircle, ClipboardList, Loader2 } from "lucide-react"
import { toast } from "sonner"

interface Props {
  requestId: string
  token: string
}

export function LandlordApprovalClient({ requestId, token }: Readonly<Props>) {
  const [action, setAction] = useState<"approve" | "reject" | "quote" | null>(null)
  const [rejectReason, setRejectReason] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState<"approved" | "rejected" | "quote_requested" | null>(null)

  async function submit(decision: "approve" | "reject" | "quote_requested") {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/approve/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, decision, rejection_reason: rejectReason }),
      })
      if (!res.ok) {
        toast.error("Could not submit — please try again")
        return
      }
      let doneState: "approved" | "rejected" | "quote_requested"
      if (decision === "approve") { doneState = "approved" }
      else if (decision === "reject") { doneState = "rejected" }
      else { doneState = "quote_requested" }
      setDone(doneState)
    } catch {
      toast.error("Could not submit — please check your connection")
    } finally {
      setSubmitting(false)
    }
  }

  if (done === "approved") {
    return (
      <div className="rounded-xl border border-success/30 bg-success/5 px-5 py-6 text-center space-y-2">
        <CheckCircle2 className="h-10 w-10 text-success mx-auto" />
        <p className="font-semibold text-lg">Work approved</p>
        <p className="text-sm text-muted-foreground">The property manager has been notified. Work will proceed.</p>
      </div>
    )
  }

  if (done === "rejected") {
    return (
      <div className="rounded-xl border border-danger/30 bg-danger-bg px-5 py-6 text-center space-y-2">
        <XCircle className="h-10 w-10 text-danger mx-auto" />
        <p className="font-semibold text-lg">Work rejected</p>
        <p className="text-sm text-muted-foreground">The property manager has been notified.</p>
      </div>
    )
  }

  if (done === "quote_requested") {
    return (
      <div className="rounded-xl border border-info/30 bg-info/5 px-5 py-6 text-center space-y-2">
        <ClipboardList className="h-10 w-10 text-info mx-auto" />
        <p className="font-semibold text-lg">Quote requested</p>
        <p className="text-sm text-muted-foreground">The contractor will be asked to submit a formal quote before work proceeds.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Approve */}
      {action !== "reject" && action !== "quote" && (
        <button
          type="button"
          disabled={submitting}
          onClick={() => submit("approve")}
          className="w-full flex items-center justify-center gap-2.5 rounded-xl border-2 border-success bg-success/5 px-5 py-4 text-sm font-semibold text-success hover:bg-success/10 transition-colors disabled:opacity-50"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
          Approve — authorise work to proceed
        </button>
      )}

      {/* Reject */}
      {action !== "quote" && (
        <>
          {action !== "reject" ? (
            <button
              type="button"
              onClick={() => setAction("reject")}
              className="w-full flex items-center justify-center gap-2.5 rounded-xl border-2 border-danger/40 bg-danger-bg px-5 py-4 text-sm font-semibold text-danger hover:border-danger hover:bg-danger/10 transition-colors"
            >
              <XCircle className="h-5 w-5" />
              Reject
            </button>
          ) : (
            <div className="rounded-xl border border-danger/30 bg-surface-elevated px-5 py-4 space-y-3">
              <p className="text-sm font-medium text-danger">Reject this request</p>
              <Textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={2}
                placeholder="Reason (optional) — e.g. Please get a second quote first"
                className="resize-none text-sm"
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={submitting}
                  onClick={() => submit("reject")}
                >
                  {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                  Confirm rejection
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setAction(null)}>Cancel</Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Request quote */}
      {action !== "reject" && (
        <>
          {action !== "quote" ? (
            <button
              type="button"
              onClick={() => setAction("quote")}
              className="w-full flex items-center justify-center gap-2.5 rounded-xl border border-border/60 bg-surface-elevated px-5 py-3.5 text-sm text-muted-foreground hover:text-foreground hover:border-border transition-colors"
            >
              <ClipboardList className="h-4.5 w-4.5" />
              Request a formal quote first
            </button>
          ) : (
            <div className="rounded-xl border border-info/20 bg-info/5 px-5 py-4 space-y-3">
              <p className="text-sm">The contractor will be asked to submit a formal quote. Work won&apos;t proceed until you approve the quote.</p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  disabled={submitting}
                  onClick={() => submit("quote_requested")}
                >
                  {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
                  Request quote
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setAction(null)}>Cancel</Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
