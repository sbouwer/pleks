"use client"

import { useState, useTransition } from "react"
import { Zap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { enableLeasePremium } from "@/lib/actions/billing"
import { OWNER_PRO_PRICE_CENTS, OWNER_PRO_MAX_LEASES, formatZAR } from "@/lib/constants"
import { toast } from "sonner"

function buildSlotsLeftStr(slotsLeft: number): string {
  if (slotsLeft <= 0) return ""
  if (slotsLeft === 1) return " · 1 slot remaining"
  return ` · ${slotsLeft} slots remaining`
}

interface OwnerProUpgradeCardProps {
  /** leaseId is null for new-lease flow (premium toggled before lease is created) */
  leaseId?: string | null
  /** How many of the 3 slots are already in use */
  usedSlots: number
  /** Context hint shown below the features list */
  context?: "new_lease" | "renewal"
  /** Called when user enables premium (for new-lease flow the parent stores the flag) */
  onEnable?: () => void
  /** Called when user skips */
  onSkip?: () => void
  /** Whether the card is already in "enabled" state */
  enabled?: boolean
}

export function OwnerProUpgradeCard({
  leaseId,
  usedSlots,
  context = "new_lease",
  onEnable,
  onSkip,
  enabled = false,
}: OwnerProUpgradeCardProps) {
  const [pending, startTransition] = useTransition()
  const [done, setDone] = useState(enabled)

  const slotsLeft = OWNER_PRO_MAX_LEASES - usedSlots
  const slotsLeftStr = buildSlotsLeftStr(slotsLeft)

  function handleEnable() {
    if (leaseId) {
      // Existing lease — call server action directly
      startTransition(async () => {
        const result = await enableLeasePremium(leaseId)
        if (result.error) {
          toast.error(result.error)
        } else {
          setDone(true)
          toast.success("Owner Pro enabled for this lease")
          onEnable?.()
        }
      })
    } else {
      // New-lease flow — parent handles the state
      setDone(true)
      onEnable?.()
    }
  }

  if (done) {
    return (
      <div className="rounded-xl border border-brand/40 bg-brand/5 px-4 py-3 flex items-center gap-3">
        <Zap className="h-4 w-4 text-brand shrink-0" />
        <p className="text-sm font-medium text-brand">
          Owner Pro enabled · {formatZAR(OWNER_PRO_PRICE_CENTS)}/month added to your account
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-brand/30 bg-brand/5 px-4 py-4 space-y-3">
      <div className="flex items-center gap-2">
        <Zap className="h-4 w-4 text-brand shrink-0" />
        <p className="text-sm font-semibold">Unlock Owner Pro for this lease</p>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">
        Enable WhatsApp notifications, document editor, AI welcome pack, and FitScore
        screening for this lease.
      </p>

      <div className="text-sm font-medium">
        {formatZAR(OWNER_PRO_PRICE_CENTS)}/month · billed monthly from your account
      </div>

      {context === "renewal" && (
        <p className="text-xs text-muted-foreground bg-muted/50 rounded px-3 py-2">
          This is a renewal — a good moment to enable Owner Pro and factor{" "}
          {formatZAR(OWNER_PRO_PRICE_CENTS)} into the new rent. At{" "}
          {formatZAR(OWNER_PRO_PRICE_CENTS)} more per month, most tenants don&apos;t notice.
        </p>
      )}

      {context === "new_lease" && (
        <p className="text-xs text-muted-foreground bg-muted/50 rounded px-3 py-2">
          Most landlords factor {formatZAR(OWNER_PRO_PRICE_CENTS)} into the rent — at R8,599
          instead of R8,500, tenants rarely notice, and you get professional software.
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button size="sm" onClick={handleEnable} disabled={pending}>
          {pending ? "Enabling…" : "Enable Owner Pro"}
        </Button>
        {onSkip && (
          <button
            type="button"
            onClick={onSkip}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            Skip for now
          </button>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground">
        {usedSlots} of {OWNER_PRO_MAX_LEASES} premium slots used{slotsLeftStr}
      </p>
    </div>
  )
}
