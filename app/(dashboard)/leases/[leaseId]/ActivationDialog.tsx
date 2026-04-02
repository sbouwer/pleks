"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { markAsSigned } from "@/lib/actions/leases"

export interface CascadeStep {
  step: string
  status: "success" | "failed" | "skipped"
  detail?: string
}

interface ActivationDialogProps {
  leaseId: string
  leaseData: {
    tenantName: string
    unitLabel: string
    depositAmountCents: number | null
    startDate: string | null
    rentAmountCents: number
    debiCheckEnabled: boolean
  }
  open: boolean
  onOpenChange: (open: boolean) => void
  onActivated: (steps: CascadeStep[]) => void
}

function formatRand(cents: number) {
  return `R ${(cents / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}`
}

function formatDate(iso: string | null) {
  if (!iso) return "move-in date"
  return new Date(iso).toLocaleDateString("en-ZA", {
    day: "numeric",
    month: "long",
    year: "numeric",
  })
}

export function ActivationDialog({
  leaseId,
  leaseData,
  open,
  onOpenChange,
  onActivated,
}: Readonly<ActivationDialogProps>) {
  const [activating, setActivating] = useState(false)

  const { tenantName, unitLabel, depositAmountCents, startDate, debiCheckEnabled } = leaseData

  const cascadeItems = [
    "Set lease status to Active",
    `Mark ${unitLabel} as occupied`,
    ...(depositAmountCents && depositAmountCents > 0
      ? [`Record deposit of ${formatRand(depositAmountCents)}`]
      : []),
    "Generate first month's invoice",
    `Schedule move-in inspection for ${formatDate(startDate)}`,
    `Create tenancy record for ${tenantName}`,
    ...(debiCheckEnabled ? ["Initiate DebiCheck mandate setup"] : []),
  ]

  async function handleActivate() {
    setActivating(true)
    const result = await markAsSigned(leaseId)
    setActivating(false)
    if (result?.error) {
      toast.error(result.error)
    } else if (result?.steps) {
      const failedSteps = result.steps.filter((s) => s.status === "failed")
      if (failedSteps.length > 0) {
        toast.warning(`Lease activated with ${failedSteps.length} issue(s) — check the event log`)
      } else {
        toast.success("Lease activated successfully")
      }
      onOpenChange(false)
      onActivated(result.steps)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={!activating}>
        <DialogHeader>
          <DialogTitle>Activate this lease?</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Activating this lease will automatically:
          </p>
          <ul className="space-y-1.5">
            {cascadeItems.map((item) => (
              <li key={item} className="flex items-start gap-2 text-sm">
                <span className="mt-0.5 size-1.5 shrink-0 rounded-full bg-foreground/40 translate-y-[5px]" />
                {item}
              </li>
            ))}
          </ul>

          <p className="text-xs font-medium text-destructive">
            This action cannot be undone.
          </p>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={activating}
          >
            Cancel
          </Button>
          <Button onClick={handleActivate} disabled={activating}>
            {activating ? "Activating…" : "Activate lease"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
