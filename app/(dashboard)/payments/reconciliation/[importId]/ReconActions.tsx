"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
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

  async function handleSignOff() {
    const result = await signOffReconciliation(importId)
    if (result?.error) {
      toast.error(result.error)
    } else {
      toast.success("Reconciliation signed off")
      router.refresh()
    }
  }

  if (reconciled) {
    return (
      <div className="flex items-center gap-2 text-success text-sm">
        <Check className="h-4 w-4" /> Reconciled
      </div>
    )
  }

  return (
    <div className="flex gap-2">
      {unmatched > 0 && (
        <Button size="sm" variant="outline" onClick={handleAutoMatch} disabled={matching}>
          <Wand2 className="h-4 w-4 mr-1" />
          {matching ? "Matching…" : "Auto-match"}
        </Button>
      )}
      <Button size="sm" onClick={handleSignOff} disabled={unmatched > 0}>
        {unmatched > 0 ? `${unmatched} unmatched` : "Sign Off Reconciliation"}
      </Button>
    </div>
  )
}
