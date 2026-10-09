"use client"

/**
 * app/(dashboard)/leases/[leaseId]/RecordDepositButton.tsx — the agent's "deposit received" tick on an active lease
 *
 * Route:  /leases/[leaseId] (finance tab)
 * Auth:   recordLeaseDepositReceived gates on requireAgentWriteAccess + the leases capability
 * Data:   recordLeaseDepositReceived server action (trust ledger via record_deposit_atomic)
 * Notes:  For a lease activated before the deposit arrived, or by DocuSeal where nobody could tick it. Asks before
 *         posting, because the entry lands in the trust account.
 */
import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { ActionButton } from "@/components/ui/actions"
import { recordLeaseDepositReceived } from "@/lib/actions/leases"
import { formatZAR } from "@/lib/constants"

export function RecordDepositButton({ leaseId, depositAmountCents }: Readonly<{ leaseId: string; depositAmountCents: number }>) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)

  async function handleClick() {
    if (!window.confirm(`Record the deposit of ${formatZAR(depositAmountCents, true)} as received into the trust account?`)) return
    setBusy(true)
    const result = await recordLeaseDepositReceived(leaseId)
    setBusy(false)
    if ("error" in result) {
      toast.error(result.error)
      return
    }
    toast.success("Deposit recorded")
    router.refresh()
  }

  return (
    <ActionButton tone="secondary" onClick={handleClick} disabled={busy}>
      {busy ? "Recording…" : "Record deposit received"}
    </ActionButton>
  )
}
