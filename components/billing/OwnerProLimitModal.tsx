"use client"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { useRouter } from "next/navigation"
import { OWNER_PRO_PRICE_CENTS, OWNER_PRO_MAX_LEASES, TIER_PRICING, formatZAR } from "@/lib/constants"

interface OwnerProLimitModalProps {
  open: boolean
  onClose: () => void
  currentPremiumCount: number
}

export function OwnerProLimitModal({
  open,
  onClose,
  currentPremiumCount,
}: OwnerProLimitModalProps) {
  const router = useRouter()

  const ownerProTotal   = currentPremiumCount * OWNER_PRO_PRICE_CENTS
  const stewardPrice    = TIER_PRICING.steward.monthly
  const savingsAt4      = OWNER_PRO_MAX_LEASES * OWNER_PRO_PRICE_CENTS + OWNER_PRO_PRICE_CENTS - stewardPrice
  const savingsAt10     = 10 * OWNER_PRO_PRICE_CENTS - stewardPrice

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>You&apos;ve reached the 3-lease Owner Pro cap</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-1">
          <p className="text-sm text-muted-foreground">
            Adding Owner Pro to a 4th lease costs less as part of the Steward plan:
          </p>

          <div className="rounded-lg border bg-muted/30 divide-y text-sm">
            <div className="flex justify-between px-4 py-2.5">
              <span className="text-muted-foreground">
                {OWNER_PRO_MAX_LEASES} × Owner Pro
              </span>
              <span>{formatZAR(ownerProTotal)}/mo</span>
            </div>
            <div className="flex justify-between px-4 py-2.5">
              <span className="text-muted-foreground">Steward plan (up to 20 leases)</span>
              <span>{formatZAR(stewardPrice)}/mo</span>
            </div>
            {savingsAt4 > 0 && (
              <div className="flex justify-between px-4 py-2.5 text-success">
                <span>With 4 premium leases: Steward saves</span>
                <span>{formatZAR(savingsAt4)}/mo</span>
              </div>
            )}
            {savingsAt10 > 0 && (
              <div className="flex justify-between px-4 py-2.5 text-success">
                <span>With 10 premium leases: Steward saves</span>
                <span>{formatZAR(savingsAt10)}/mo</span>
              </div>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            All your existing premium leases carry over. Steward covers up to 20 leases
            with all features included — no per-lease billing.
          </p>
        </div>

        <div className="flex gap-3 pt-2">
          <Button
            className="flex-1"
            onClick={() => { router.push("/settings/billing"); onClose() }}
          >
            Upgrade to Steward
          </Button>
          <Button variant="outline" onClick={onClose}>
            Keep {OWNER_PRO_MAX_LEASES} Owner Pro leases
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
