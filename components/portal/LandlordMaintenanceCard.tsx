"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { CheckCircle2, XCircle, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { formatZAR } from "@/lib/constants"
import Link from "next/link"

interface MaintenanceReq {
  id: string
  title: string
  urgency: string | null
  status: string
  estimated_cost_cents: number | null
  quoted_cost_cents: number | null
  actual_cost_cents: number | null
  landlord_approval_token: string | null
  contractor_view: unknown
}

interface Props {
  req: MaintenanceReq
  showApproveActions?: boolean
}

const URGENCY_DOT: Record<string, string> = {
  emergency: "bg-danger", urgent: "bg-warning", routine: "bg-info", cosmetic: "bg-muted-foreground/40",
}

export function LandlordMaintenanceCard({ req, showApproveActions }: Readonly<Props>) {
  const contractor = req.contractor_view as { company_name: string | null; first_name: string | null; last_name: string | null } | null
  const contractorName = contractor?.company_name || `${contractor?.first_name ?? ""} ${contractor?.last_name ?? ""}`.trim() || null
  const cost = req.quoted_cost_cents ?? req.estimated_cost_cents

  const [decision, setDecision] = useState<"approved" | "rejected" | null>(null)
  const [showReject, setShowReject] = useState(false)
  const [rejectReason, setRejectReason] = useState("")
  const [submitting, setSubmitting] = useState(false)

  async function submitDecision(d: "approve" | "reject") {
    if (!req.landlord_approval_token) { toast.error("No approval token on this request"); return }
    setSubmitting(true)
    try {
      const res = await fetch(`/api/approve/${req.landlord_approval_token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: req.id, decision: d, rejection_reason: rejectReason }),
      })
      if (!res.ok) { toast.error("Could not submit — try again"); return }
      setDecision(d === "approve" ? "approved" : "rejected")
      toast.success(d === "approve" ? "Work approved" : "Request rejected")
    } catch {
      toast.error("Could not submit")
    } finally {
      setSubmitting(false)
    }
  }

  if (decision === "approved") {
    return (
      <div className="flex items-center gap-2 text-sm text-success py-1">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        <span>{req.title} — approved</span>
      </div>
    )
  }
  if (decision === "rejected") {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-1">
        <XCircle className="h-4 w-4 shrink-0 text-danger" />
        <span>{req.title} — rejected</span>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex items-start gap-3">
        <div className={`h-2.5 w-2.5 rounded-full shrink-0 mt-1.5 ${URGENCY_DOT[req.urgency ?? "routine"]}`} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{req.title}</p>
          <p className="text-xs text-muted-foreground">
            {contractorName ? `Contractor: ${contractorName}` : "No contractor assigned"}
            {cost ? ` · Estimated: ${formatZAR(cost)}` : ""}
          </p>
        </div>
        <Link href={`/landlord/maintenance/${req.id}`} className="text-xs text-brand hover:underline shrink-0">Details</Link>
      </div>

      {showApproveActions && !showReject && (
        <div className="flex gap-2 pl-5">
          <Button
            type="button"
            size="sm"
            className="h-7 text-xs"
            disabled={submitting}
            onClick={() => submitDecision("approve")}
          >
            {submitting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
            Approve
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            disabled={submitting}
            onClick={() => setShowReject(true)}
          >
            <XCircle className="h-3 w-3 mr-1" />
            Reject
          </Button>
        </div>
      )}

      {showApproveActions && showReject && (
        <div className="pl-5 space-y-2">
          <Textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={2}
            placeholder="Reason (optional)"
            className="resize-none text-sm"
          />
          <div className="flex gap-2">
            <Button type="button" size="sm" variant="outline" className="h-7 text-xs" disabled={submitting} onClick={() => submitDecision("reject")}>
              {submitting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
              Confirm rejection
            </Button>
            <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowReject(false)}>Cancel</Button>
          </div>
        </div>
      )}
    </div>
  )
}
