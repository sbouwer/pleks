"use client"

import { useState, useTransition } from "react"
import { AlertTriangle } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  recordInsuranceDecision,
  type InsuranceDecision,
} from "@/lib/actions/maintenance/insuranceDecision"

interface CriticalIncidentDialogProps {
  readonly requestId: string
  readonly incidentTitle: string
  readonly unitLabel: string
  readonly propertyName: string
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly onDecisionRecorded: () => void
}

export function CriticalIncidentDialog({
  requestId,
  incidentTitle,
  unitLabel,
  propertyName,
  open,
  onOpenChange,
  onDecisionRecorded,
}: CriticalIncidentDialogProps) {
  const [notes, setNotes] = useState("")
  const [pending, startTransition] = useTransition()

  function handleDecision(decision: InsuranceDecision) {
    startTransition(async () => {
      const result = await recordInsuranceDecision({ requestId, decision, notes: notes.trim() || undefined })
      if (result.error) {
        toast.error(result.error)
      } else {
        const messages: Record<InsuranceDecision, string> = {
          reported: "Broker and owner notified",
          declined: "Decision recorded",
          unsure:   "Reminder set for 4 hours",
        }
        toast.success(messages[decision])
        onOpenChange(false)
        onDecisionRecorded()
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
            <DialogTitle>Critical incident flagged</DialogTitle>
          </div>
          <DialogDescription className="space-y-1 text-sm">
            <span className="block font-medium text-foreground">{unitLabel} · {propertyName}</span>
            <span className="block text-muted-foreground">{incidentTitle}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <p className="text-sm font-medium">Need to report this incident to insurance?</p>

          <div className="space-y-2">
            <Button
              type="button"
              className="w-full"
              onClick={() => handleDecision("reported")}
              disabled={pending}
            >
              Yes, notify broker
            </Button>
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => handleDecision("declined")}
              disabled={pending}
            >
              No — won&apos;t claim
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full text-muted-foreground"
              onClick={() => handleDecision("unsure")}
              disabled={pending}
            >
              Not sure — remind me later
            </Button>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="incident-notes" className="text-xs text-muted-foreground">
              Notes (optional)
            </label>
            <Textarea
              id="incident-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Fire contained. Kitchen destroyed. Photos attached."
              disabled={pending}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            Your decision will be logged for audit purposes.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
