"use client"

/**
 * app/(dashboard)/billing/reconciliation/[importId]/FuzzyMatchActions.tsx — confirm/reject a fuzzy match (F-5)
 *
 * Route:  /billing/reconciliation/[importId]
 * Auth:   parent page is gateway-gated; resolveFuzzyMatch enforces requireAgentWriteAccess
 * Notes:  A ±R50 fuzzy auto-match is a suggestion, not a confirmed match — sign-off is blocked until each is
 *         confirmed (→ verified) or rejected (→ back to unmatched). These are the per-line confirm/reject controls.
 */
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Check, X } from "lucide-react"
import { toast } from "sonner"
import { resolveFuzzyMatch } from "@/lib/actions/recon"

export function FuzzyMatchActions({ lineId }: Readonly<{ lineId: string }>) {
  const [busy, setBusy] = useState(false)
  const router = useRouter()

  async function act(decision: "confirm" | "reject") {
    setBusy(true)
    const res = await resolveFuzzyMatch(lineId, decision)
    setBusy(false)
    if ("error" in res) { toast.error(res.error); return }
    toast.success(decision === "confirm" ? "Match confirmed" : "Suggestion rejected")
    router.refresh()
  }

  return (
    <div className="flex items-center gap-1">
      <button
        type="button" disabled={busy} onClick={() => act("confirm")} aria-label="Confirm suggested match"
        className="rounded-[var(--r-button)] border border-success/40 p-1 text-success hover:bg-success/10 disabled:opacity-50"
      >
        <Check className="size-3.5" aria-hidden />
      </button>
      <button
        type="button" disabled={busy} onClick={() => act("reject")} aria-label="Reject suggested match"
        className="rounded-[var(--r-button)] border border-danger/40 p-1 text-danger hover:bg-danger/10 disabled:opacity-50"
      >
        <X className="size-3.5" aria-hidden />
      </button>
    </div>
  )
}
