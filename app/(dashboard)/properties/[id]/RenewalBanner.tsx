"use client"

/**
 * app/(dashboard)/properties/[id]/RenewalBanner.tsx — Banner prompting re-verification of insurance checklist items after a policy renewal
 *
 * Data:   bulk-confirms items via the bulkConfirmRenewalItems server action
 * Notes:  renders only for items reset within 60 days; dismissal persisted per property+cycle in localStorage
 */

import { useState, useTransition } from "react"
import { RefreshCw, X, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { type ChecklistItemRow } from "./InsuranceChecklist"
import { bulkConfirmRenewalItems } from "./insuranceChecklistActions"

const SIXTY_DAYS_MS = 60 * 24 * 60 * 60 * 1000

function getResetItems(rows: ChecklistItemRow[]): ChecklistItemRow[] {
  const cutoff = Date.now() - SIXTY_DAYS_MS
  return rows.filter(
    (r) => r.state === "unknown" && r.renewal_reset_at !== null && new Date(r.renewal_reset_at).getTime() >= cutoff,
  )
}

function dismissKey(propertyId: string, cycleDate: string): string {
  return `renewal-banner-dismissed:${propertyId}:${cycleDate}`
}

interface Props {
  propertyId: string
  rows: ChecklistItemRow[]
}

export function RenewalBanner({ propertyId, rows }: Props) {
  const resetItems = getResetItems(rows)
  if (resetItems.length === 0) return null

  const latestReset = resetItems.reduce<string>((latest, r) => {
    const d = r.renewal_reset_at!
    return d > latest ? d : latest
  }, resetItems[0].renewal_reset_at!)

  const cycleDate = latestReset.slice(0, 10)
  const storageKey = dismissKey(propertyId, cycleDate)

  return <BannerContent propertyId={propertyId} resetItems={resetItems} storageKey={storageKey} />
}

function BannerContent({
  propertyId,
  resetItems,
  storageKey,
}: {
  propertyId: string
  resetItems: ChecklistItemRow[]
  storageKey: string
}) {
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(storageKey) === "1" } catch { return false }
  })
  const [pending, startTransition] = useTransition()

  if (dismissed) return null

  function handleDismiss() {
    try { localStorage.setItem(storageKey, "1") } catch { /* ignore */ }
    setDismissed(true)
  }

  function handleBulkConfirm() {
    startTransition(async () => {
      const ids = resetItems.map((r) => r.id)
      const result = await bulkConfirmRenewalItems(propertyId, ids)
      if (result.ok) {
        toast.success(`${ids.length} item${ids.length === 1 ? "" : "s"} marked as verified`)
        handleDismiss()
      } else {
        toast.error(result.error ?? "Failed to confirm items")
      }
    })
  }

  const count = resetItems.length

  return (
    <div className="flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50/60 dark:border-blue-900/30 dark:bg-blue-950/20 px-4 py-3 mb-4">
      <RefreshCw className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
          Policy renewed — {count} checklist item{count === 1 ? "" : "s"} need{count === 1 ? "s" : ""} re-verification
        </p>
        <p className="text-xs text-blue-700 dark:text-blue-300 mt-0.5">
          Most renewals are unchanged from last year. If nothing has shifted, mark all as verified.
        </p>
        <div className="flex flex-wrap gap-2 mt-2.5">
          <button
            type="button"
            onClick={handleBulkConfirm}
            disabled={pending}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 font-medium"
          >
            {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            Mark all as renewed and verified
          </button>
          <button
            type="button"
            onClick={handleDismiss}
            className="text-xs px-3 py-1.5 rounded-md border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 hover:bg-blue-100/50 dark:hover:bg-blue-900/30"
          >
            Dismiss
          </button>
        </div>
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        aria-label="Dismiss banner"
        className="text-blue-400 hover:text-blue-600 dark:hover:text-blue-200 shrink-0"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
