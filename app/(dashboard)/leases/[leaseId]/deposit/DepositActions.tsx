"use client"

/**
 * app/(dashboard)/leases/[leaseId]/deposit/DepositActions.tsx — agent deposit action buttons
 *
 * Route:  /leases/[leaseId]/deposit
 * Auth:   Agent session (gateway)
 * Data:   disburseDeposit, sendDepositSchedule, calculateDepositReturn server actions
 * Notes:  "Send to Tenant" transitions status to sent_to_tenant and fires deposit.return_schedule
 *         mandatory comm (BUILD_63 Phase 3).
 */
import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { disburseDeposit } from "@/lib/deposits/disburse"
import { calculateDepositReturn } from "@/lib/deposits/calculateReturn"
import { sendDepositSchedule } from "@/lib/actions/deposits"
import { useUser } from "@/hooks/useUser"
import { toast } from "sonner"

interface DepositActionsProps {
  readonly leaseId: string
  readonly reconStatus: string
  readonly hasUnconfirmedItems: boolean
}

export function DepositActions({ leaseId, reconStatus, hasUnconfirmedItems }: DepositActionsProps) {
  const { user } = useUser()
  const router = useRouter()
  const [processing, setProcessing] = useState(false)

  async function handleRecalculate() {
    setProcessing(true)
    const result = await calculateDepositReturn(leaseId)
    if ("error" in result) toast.error(result.error)
    else toast.success("Return calculation updated")
    setProcessing(false)
    router.refresh()
  }

  async function handleSendToTenant() {
    if (!confirm("This will email the deduction schedule to the tenant. Continue?")) return
    setProcessing(true)
    const result = await sendDepositSchedule(leaseId)
    if ("error" in result) toast.error(result.error)
    else toast.success("Deduction schedule sent to tenant")
    setProcessing(false)
    router.refresh()
  }

  async function handleDisburse() {
    if (!user) return
    if (hasUnconfirmedItems) {
      toast.error("All deduction items must be confirmed before disbursement")
      return
    }
    if (!confirm("This will disburse the deposit. Continue?")) return

    setProcessing(true)
    const result = await disburseDeposit(leaseId, user.id)
    if ("error" in result) toast.error(result.error)
    else toast.success("Deposit disbursed successfully")
    setProcessing(false)
    router.refresh()
  }

  function handleGeneratePDF() {
    window.open(`/api/deposits/${leaseId}/schedule-pdf`, "_blank")
  }

  if (reconStatus === "refunded") {
    return (
      <div className="text-center text-sm text-muted-foreground py-4">
        Deposit has been disbursed.
      </div>
    )
  }

  return (
    <div className="flex flex-wrap gap-3">
      <Button variant="outline" size="sm" onClick={handleRecalculate} disabled={processing}>
        Recalculate
      </Button>
      <Button variant="outline" size="sm" onClick={handleGeneratePDF}>
        Generate Schedule PDF
      </Button>
      {reconStatus !== "sent_to_tenant" && reconStatus !== "refunded" && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleSendToTenant}
          disabled={processing || hasUnconfirmedItems}
        >
          {processing ? "Sending..." : "Send to Tenant"}
        </Button>
      )}
      {reconStatus !== "refunded" && (
        <Button
          size="sm"
          onClick={handleDisburse}
          disabled={processing || hasUnconfirmedItems}
        >
          {processing ? "Processing..." : "Disburse Deposit"}
        </Button>
      )}
    </div>
  )
}
