"use client"

import { useState, useTransition } from "react"
import { Zap } from "lucide-react"
import { enableLeasePremium, disableLeasePremium } from "@/lib/actions/billing"
import { OWNER_PRO_PRICE_CENTS, OWNER_PRO_MAX_LEASES, formatZAR } from "@/lib/constants"
import { OwnerProLimitModal } from "./OwnerProLimitModal"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

interface LeasePremiumToggleProps {
  leaseId: string
  enabled: boolean
  usedSlots: number
  /** If true, shows a compact inline badge rather than the full card */
  compact?: boolean
}

export function LeasePremiumToggle({
  leaseId,
  enabled: initialEnabled,
  usedSlots,
  compact = false,
}: LeasePremiumToggleProps) {
  const [enabled, setEnabled]     = useState(initialEnabled)
  const [pending, startTransition] = useTransition()
  const [showLimitModal, setShowLimitModal] = useState(false)

  function handleToggle() {
    if (enabled) {
      // Disable
      startTransition(async () => {
        const result = await disableLeasePremium(leaseId)
        if (result.error) {
          toast.error(result.error)
        } else {
          setEnabled(false)
          toast.success("Owner Pro disabled for this lease")
        }
      })
    } else {
      // Enable — check cap first
      if (usedSlots >= OWNER_PRO_MAX_LEASES) {
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
          setEnabled(true)
          toast.success("Owner Pro enabled for this lease")
        }
      })
    }
  }

  if (compact) {
    return (
      <>
        <button
          type="button"
          onClick={handleToggle}
          disabled={pending}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
            enabled
              ? "bg-brand/10 text-brand hover:bg-brand/20"
              : "bg-muted text-muted-foreground hover:text-foreground",
          )}
        >
          <Zap className="h-3 w-3" />
          {enabled ? "Pro" : "Enable Pro"}
        </button>
        <OwnerProLimitModal
          open={showLimitModal}
          onClose={() => setShowLimitModal(false)}
          currentPremiumCount={usedSlots}
        />
      </>
    )
  }

  return (
    <>
      <div className="flex items-center justify-between rounded-lg border bg-card px-4 py-3">
        <div className="flex items-center gap-3">
          <div className={cn(
            "flex h-8 w-8 items-center justify-center rounded-md",
            enabled ? "bg-brand/10" : "bg-muted",
          )}>
            <Zap className={cn("h-4 w-4", enabled ? "text-brand" : "text-muted-foreground")} />
          </div>
          <div>
            <p className="text-sm font-medium">Owner Pro</p>
            <p className="text-xs text-muted-foreground">
              {enabled
                ? `WhatsApp, document editor, AI welcome pack · ${formatZAR(OWNER_PRO_PRICE_CENTS)}/mo`
                : `Unlock premium features · ${formatZAR(OWNER_PRO_PRICE_CENTS)}/mo`}
            </p>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={handleToggle}
          disabled={pending}
          className={cn(
            "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
            "disabled:opacity-50",
            enabled ? "bg-brand" : "bg-input",
          )}
        >
          <span
            className={cn(
              "pointer-events-none inline-block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform",
              enabled ? "translate-x-4" : "translate-x-0",
            )}
          />
        </button>
      </div>

      <OwnerProLimitModal
        open={showLimitModal}
        onClose={() => setShowLimitModal(false)}
        currentPremiumCount={usedSlots}
      />
    </>
  )
}
