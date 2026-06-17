"use client"

/**
 * app/(dashboard)/billing/reconciliation/[importId]/ReconActions.tsx — Auto-match and sign-off actions for a bank reconciliation import.
 *
 * Route:  /billing/reconciliation/[importId]
 * Auth:   requireAdminAuth
 * Data:   reconciled and unmatched props from parent server component; mutations via recon server actions
 * Notes:  Sign-off is disabled while unmatched transactions remain; auto-match only shown when unmatched > 0
 */

import { useState } from "react"
import { ActionButton, Modal } from "@/components/ui/actions"
import { signOffReconciliation, runAutoMatch } from "@/lib/actions/recon"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Check, Wand2 } from "lucide-react"

interface ReconActionsProps {
  readonly importId: string
  readonly reconciled: boolean
  readonly unmatched: number
}

export function ReconActions({ importId, reconciled, unmatched }: ReconActionsProps) {
  const router = useRouter()
  const [matching, setMatching] = useState(false)
  const [signing, setSigning] = useState(false)
  const [variancePrompt, setVariancePrompt] = useState<string | null>(null)
  const [reason, setReason] = useState("")

  async function handleAutoMatch() {
    setMatching(true)
    const result = await runAutoMatch(importId)
    if ("error" in result) {
      toast.error(result.error)
    } else if (result.matched === 0) {
      toast.info("No automatic matches found")
    } else {
      toast.success(`${result.matched} transaction${result.matched !== 1 ? "s" : ""} matched automatically`)
      router.refresh()
    }
    setMatching(false)
  }

  function finishSignOff(result: Awaited<ReturnType<typeof signOffReconciliation>>) {
    if (result?.error) toast.error(result.error)
    else { toast.success("Reconciliation signed off"); router.refresh() }
  }

  async function handleSignOff() {
    setSigning(true)
    const result = await signOffReconciliation(importId)
    setSigning(false)
    // Non-zero discrepancy (F-5): require an explicit accept-variance reason before closing.
    if (result && "needsVariance" in result && result.needsVariance) {
      setReason("")
      setVariancePrompt(result.error ?? "There is a discrepancy on this reconciliation.")
      return
    }
    finishSignOff(result)
  }

  async function confirmVariance() {
    if (!reason.trim()) return
    setSigning(true)
    const result = await signOffReconciliation(importId, { reason: reason.trim() })
    setSigning(false)
    setVariancePrompt(null)
    finishSignOff(result)
  }

  function cancelVariance() {
    setVariancePrompt(null)
    toast.info("Sign-off cancelled — discrepancy not accepted")
  }

  if (reconciled) {
    return (
      <div className="flex items-center gap-2 text-success text-sm">
        <Check className="h-4 w-4" /> Reconciled
      </div>
    )
  }

  return (
    <>
      <div className="flex gap-2">
        {unmatched > 0 && (
          <ActionButton tone="secondary" icon={<Wand2 className="h-4 w-4" />} onClick={handleAutoMatch} disabled={matching}>
            {matching ? "Matching…" : "Auto-match"}
          </ActionButton>
        )}
        <ActionButton tone="primary" onClick={handleSignOff} disabled={unmatched > 0 || signing}>
          {unmatched > 0 ? `${unmatched} unmatched` : "Sign Off Reconciliation"}
        </ActionButton>
      </div>

      <Modal
        open={!!variancePrompt}
        onClose={cancelVariance}
        title="Accept variance?"
        actions={
          <div className="flex w-full items-center justify-between gap-3">
            <ActionButton tone="secondary" className="pa-cancel-glow" onClick={cancelVariance} disabled={signing}>Cancel</ActionButton>
            <ActionButton tone="destructive" onClick={confirmVariance} disabled={signing || !reason.trim()}>
              {signing ? "Signing off…" : "Sign off anyway"}
            </ActionButton>
          </div>
        }
      >
        <div className="space-y-3">
          <p className="text-sm">{variancePrompt}</p>
          <div className="space-y-1.5">
            <label htmlFor="variance-reason" className="block text-[11px] font-medium uppercase tracking-[0.1em] text-muted-foreground">
              Reason for accepting this variance
            </label>
            <textarea
              id="variance-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="Explain why this discrepancy is acceptable to sign off."
              className="w-full resize-none rounded-[var(--r-button)] border border-input bg-transparent px-3 py-2 text-sm transition-colors focus:border-primary focus:outline-none"
            />
          </div>
        </div>
      </Modal>
    </>
  )
}
