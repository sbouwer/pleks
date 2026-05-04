"use client"

/**
 * components/maintenance/dialogs/CancelDialog.tsx — structured cancellation with category card grid and side-effect transparency
 *
 * Data:   calls cancelMaintenanceRequest on confirm; caller passes requestId + context
 * Notes:  Category required + reason ≥10 chars (Tribunal-grade). Side-effect panel shows
 *         runtime consequences based on current status (token revocation, comms, audit trail).
 */

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, ShieldAlert } from "lucide-react"
import { toast } from "sonner"
import { ActionButton } from "@/components/ui/actions"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cancelMaintenanceRequest } from "@/lib/actions/maintenance"
import { cn } from "@/lib/utils"

const CATEGORIES: { value: string; label: string; sub: string }[] = [
  { value: "tenant_withdrew",            label: "Tenant withdrew",        sub: "Tenant called/emailed asking to retract." },
  { value: "duplicate_request",          label: "Duplicate request",      sub: "Already exists under another WO number." },
  { value: "no_longer_required",         label: "No longer required",     sub: "Issue resolved itself or by other means." },
  { value: "contractor_unavailable",     label: "Contractor unavailable", sub: "No suitable contractor found in time." },
  { value: "agent_decision",             label: "Agent decision",         sub: "Out-of-scope, deferred, or non-urgent." },
  { value: "work_completed_externally",  label: "Done externally",        sub: "Tenant or landlord arranged it outside Pleks." },
  { value: "wrong_property",             label: "Wrong property",         sub: "Logged against the wrong unit; recreate elsewhere." },
  { value: "other",                      label: "Other",                  sub: "Edge case — describe in reason field." },
]

const WO_SENT_STATUSES = new Set(["work_order_sent", "in_progress", "pending_completion"])

interface Props {
  requestId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  status: string
  workOrderNumber: string | null
  contractorName: string | null
  loggedBy: string | null
}

export function CancelDialog({
  requestId, open, onOpenChange,
  status, workOrderNumber, contractorName, loggedBy,
}: Readonly<Props>) {
  const router = useRouter()
  const [category, setCategory] = useState("")
  const [reason, setReason] = useState("")
  const [pending, startTransition] = useTransition()

  const woSent = WO_SENT_STATUSES.has(status)
  const tenantNotified = woSent && loggedBy === "tenant"
  const reasonTooShort = reason.trim().length > 0 && reason.trim().length < 10
  const valid = !!category && reason.trim().length >= 10

  function handleOpenChange(v: boolean) {
    if (!v) { setCategory(""); setReason("") }
    onOpenChange(v)
  }

  function handleCancel() {
    if (!valid) return
    startTransition(async () => {
      const result = await cancelMaintenanceRequest(requestId, reason.trim(), category)
      if ("error" in result) {
        toast.error(result.error)
      } else {
        toast.success("Job cancelled")
        handleOpenChange(false)
        router.refresh()
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
              <DialogTitle className="text-destructive">
                Cancel job{workOrderNumber ? ` — ${workOrderNumber}` : ""}
              </DialogTitle>
            </div>
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground pt-1 shrink-0">
              Reason &amp; category required
            </span>
          </div>
          <DialogDescription>
            This is a terminal state. The job moves to the cancelled list and contractor access will be revoked.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 pt-1">

          {/* Category grid */}
          <div className="space-y-2">
            <Label>Cancellation category</Label>
            <div className="grid grid-cols-2 gap-2">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat.value}
                  type="button"
                  disabled={pending}
                  onClick={() => setCategory(cat.value)}
                  className={cn(
                    "flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                    category === cat.value
                      ? "border-amber-500 bg-amber-500/5"
                      : "border-border hover:border-muted-foreground/40 hover:bg-muted/30"
                  )}
                >
                  <span className={cn(
                    "mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 flex items-center justify-center",
                    category === cat.value ? "border-amber-500 bg-amber-500" : "border-muted-foreground/40"
                  )}>
                    {category === cat.value && (
                      <span className="h-1.5 w-1.5 rounded-full bg-white" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium leading-tight">{cat.label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{cat.sub}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Reason */}
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <Label htmlFor="cancel-reason">Reason</Label>
              <span className="text-xs text-muted-foreground">visible in audit trail and to landlord</span>
            </div>
            <Textarea
              id="cancel-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Required. Be specific — Tribunal-grade."
              disabled={pending}
              className={cn(reasonTooShort && "border-destructive")}
            />
            {reasonTooShort && (
              <p className="text-xs text-destructive">Minimum 10 characters required</p>
            )}
          </div>

          {/* Side-effect panel */}
          <div className="rounded-lg border border-border bg-muted/20 px-4 py-3 space-y-2">
            <div className="flex items-center gap-1.5">
              <ShieldAlert className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Side effects · status: <span className="font-mono text-foreground">{status}</span>
              </p>
            </div>
            <ul className="space-y-1.5 text-xs text-muted-foreground">
              <li className="flex items-start gap-1.5">
                <span className="mt-px shrink-0">·</span>
                <span>Set cancellation reason, category, and timestamp on the request.</span>
              </li>
              {woSent && contractorName && (
                <li className="flex items-start gap-1.5">
                  <span className="mt-px shrink-0">·</span>
                  <span>Revoke <span className="font-medium text-foreground">{contractorName}</span>&apos;s WO portal token — access revoked on next page load.</span>
                </li>
              )}
              {woSent && contractorName && (
                <li className="flex items-start gap-1.5">
                  <span className="mt-px shrink-0">·</span>
                  <span>Email <span className="font-medium text-foreground">{contractorName}</span> via <span className="font-mono">maintenance.cancelled</span>.</span>
                </li>
              )}
              {tenantNotified && (
                <li className="flex items-start gap-1.5">
                  <span className="mt-px shrink-0">·</span>
                  <span>Email tenant via <span className="font-mono">maintenance.cancelled_tenant</span> — request was logged via tenant portal.</span>
                </li>
              )}
              {!woSent && (
                <li className="flex items-start gap-1.5">
                  <span className="mt-px shrink-0">·</span>
                  <span>No external notifications — contractor was not yet notified of this request.</span>
                </li>
              )}
              <li className="flex items-start gap-1.5">
                <span className="mt-px shrink-0">·</span>
                <span>Append UPDATE + NOTE entries to audit trail with your reason.</span>
              </li>
            </ul>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-4 pt-1">
            <p className="text-xs text-muted-foreground">
              After cancellation you can recreate as a new job — the old WO is preserved for the audit trail.
            </p>
            <div className="flex gap-2 shrink-0">
              <ActionButton tone="secondary" onClick={() => handleOpenChange(false)} disabled={pending}>
                Keep job open
              </ActionButton>
              <ActionButton tone="destructive" onClick={handleCancel} disabled={!valid || pending}>
                {pending ? "Cancelling…" : "Cancel job"}
              </ActionButton>
            </div>
          </div>

        </div>
      </DialogContent>
    </Dialog>
  )
}
