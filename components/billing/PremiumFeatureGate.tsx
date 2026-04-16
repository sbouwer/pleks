"use client"

import { useState, useTransition } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Zap } from "lucide-react"
import { enableLeasePremium } from "@/lib/actions/billing"
import { OWNER_PRO_PRICE_CENTS, OWNER_PRO_MAX_LEASES, formatZAR } from "@/lib/constants"
import { PREMIUM_FEATURE_LABELS, type LeasePremiumFeature } from "@/lib/billing/leaseFeatures"
import { OwnerProLimitModal } from "./OwnerProLimitModal"
import { toast } from "sonner"

interface PremiumFeatureGateProps {
  open: boolean
  onClose: () => void
  /** The feature the user was trying to access */
  feature: LeasePremiumFeature
  /** The lease they were accessing it on */
  leaseId: string
  /** Human-readable lease label (tenant name or unit) */
  leaseLabel?: string | null
  /** How many premium slots are already in use — to show correct prompt */
  usedSlots: number
  /** Called after premium is successfully enabled */
  onEnabled?: () => void
}

export function PremiumFeatureGate({
  open,
  onClose,
  feature,
  leaseId,
  leaseLabel,
  usedSlots,
  onEnabled,
}: PremiumFeatureGateProps) {
  const [pending, startTransition] = useTransition()
  const [showLimitModal, setShowLimitModal] = useState(false)

  const featureLabel = PREMIUM_FEATURE_LABELS[feature]
  const atCap = usedSlots >= OWNER_PRO_MAX_LEASES

  function handleEnable() {
    if (atCap) {
      setShowLimitModal(true)
      return
    }
    startTransition(async () => {
      const result = await enableLeasePremium(leaseId)
      if (result.error) {
        if (result.error.includes("cap")) {
          setShowLimitModal(true)
        } else {
          toast.error(result.error)
        }
      } else {
        toast.success("Owner Pro enabled for this lease")
        onEnabled?.()
        onClose()
      }
    })
  }

  return (
    <>
      <Dialog open={open && !showLimitModal} onOpenChange={(v) => { if (!v) onClose() }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-brand" />
              {featureLabel} is a premium feature
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-1">
            <p className="text-sm text-muted-foreground">
              Enable Owner Pro on{leaseLabel ? ` the ${leaseLabel} lease` : " this lease"} for{" "}
              {formatZAR(OWNER_PRO_PRICE_CENTS)}/month to unlock {featureLabel.toLowerCase()} and
              other premium features for this tenant.
            </p>

            <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              {usedSlots} of {OWNER_PRO_MAX_LEASES} premium slots used
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button className="flex-1" onClick={handleEnable} disabled={pending}>
              {pending ? "Enabling…" : "Enable on this lease"}
            </Button>
            <Button variant="outline" onClick={onClose}>
              Maybe later
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <OwnerProLimitModal
        open={showLimitModal}
        onClose={() => { setShowLimitModal(false); onClose() }}
        currentPremiumCount={usedSlots}
      />
    </>
  )
}
