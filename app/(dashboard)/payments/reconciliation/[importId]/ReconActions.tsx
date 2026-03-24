"use client"

import { Button } from "@/components/ui/button"
import { signOffReconciliation } from "@/lib/actions/recon"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Check } from "lucide-react"

interface ReconActionsProps {
  readonly importId: string
  readonly reconciled: boolean
  readonly unmatched: number
}

export function ReconActions({ importId, reconciled, unmatched }: ReconActionsProps) {
  const router = useRouter()

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
    <Button size="sm" onClick={handleSignOff} disabled={unmatched > 0}>
      {unmatched > 0 ? `${unmatched} unmatched — resolve first` : "Sign Off Reconciliation"}
    </Button>
  )
}
