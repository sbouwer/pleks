"use client"

/**
 * app/(dashboard)/leases/[leaseId]/deposit/DepositActions.tsx — agent deposit action buttons
 *
 * Route:  /leases/[leaseId]/deposit
 * Auth:   Agent session (gateway)
 * Data:   disburseDeposit, sendDepositSchedule, calculateDepositReturn server actions
 * Notes:  ADDENDUM_63B: hasUnconfirmedCharges added to disburse gate alongside hasUnconfirmedItems.
 *         "Send to Tenant" transitions status to sent_to_tenant and fires deposit.return_schedule
 *         mandatory comm (BUILD_63 Phase 3).
 */
import { useState } from "react"
import { useRouter } from "next/navigation"
import { ActionButton } from "@/components/ui/actions"
import { disburseDeposit } from "@/lib/deposits/disburse"
import { calculateDepositReturn } from "@/lib/deposits/calculateReturn"
import { sendDepositSchedule } from "@/lib/actions/deposits"
import { useUser } from "@/hooks/useUser"
import { ConfirmDialog } from "@/components/shared/ConfirmDialog"
import { toast } from "sonner"

interface DepositActionsProps {
  readonly leaseId: string
  readonly reconStatus: string
  readonly hasUnconfirmedItems: boolean
  readonly hasUnconfirmedCharges: boolean
  readonly timerOverdue?: boolean
}

export function DepositActions({ leaseId, reconStatus, hasUnconfirmedItems, hasUnconfirmedCharges, timerOverdue }: DepositActionsProps) {
  const { user } = useUser()
  const router = useRouter()
  const [processing, setProcessing] = useState(false)
  const [confirmSend, setConfirmSend] = useState(false)
  const [confirmDisburse, setConfirmDisburse] = useState(false)

  const blockDisburse = hasUnconfirmedItems || hasUnconfirmedCharges

  async function handleRecalculate() {
    setProcessing(true)
    const result = await calculateDepositReturn(leaseId)
    if ("error" in result) toast.error(result.error)
    else toast.success("Return calculation updated")
    setProcessing(false)
    router.refresh()
  }

  async function doSendToTenant() {
    setProcessing(true)
    const result = await sendDepositSchedule(leaseId)
    if ("error" in result) toast.error(result.error)
    else toast.success("Deduction schedule sent to tenant")
    setProcessing(false)
    setConfirmSend(false)
    router.refresh()
  }

  function handleDisburse() {
    if (!user) return
    if (blockDisburse) {
      if (hasUnconfirmedItems) toast.error("All deduction items must be confirmed before disbursement")
      else toast.error("All non-damage charges must be confirmed before disbursement")
      return
    }
    setConfirmDisburse(true)
  }

  async function doDisburse() {
    if (!user) return
    setProcessing(true)
    const result = await disburseDeposit(leaseId)
    if ("error" in result) toast.error(result.error)
    else toast.success("Deposit disbursed successfully")
    setProcessing(false)
    setConfirmDisburse(false)
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
      <ActionButton tone="secondary" onClick={handleRecalculate} disabled={processing}>
        Recalculate
      </ActionButton>
      <ActionButton tone="secondary" onClick={handleGeneratePDF}>
        Generate Schedule PDF
      </ActionButton>
      {reconStatus !== "sent_to_tenant" && reconStatus !== "refunded" && (
        <ActionButton
          tone="secondary"
          onClick={() => setConfirmSend(true)}
          disabled={processing || blockDisburse}
        >
          {processing ? "Sending..." : "Send to Tenant"}
        </ActionButton>
      )}
      {reconStatus !== "refunded" && (
        <ActionButton
          tone="primary"
          onClick={handleDisburse}
          disabled={processing || blockDisburse}
        >
          {processing ? "Processing..." : "Disburse Deposit"}
        </ActionButton>
      )}

      <ConfirmDialog
        open={confirmSend}
        onOpenChange={(o) => { if (!o) setConfirmSend(false) }}
        title="Send to tenant?"
        description="This will email the deduction schedule to the tenant."
        confirmLabel="Send"
        onConfirm={doSendToTenant}
        loading={processing}
      />
      <ConfirmDialog
        open={confirmDisburse}
        onOpenChange={(o) => { if (!o) setConfirmDisburse(false) }}
        title="Disburse deposit?"
        description={timerOverdue
          ? "This deposit return is PAST its statutory deadline (RHA 14/21-day). Disbursing now is late — the tenant may have a Tribunal claim. This will disburse the deposit and settle all charges."
          : "This will disburse the deposit and settle all charges."}
        variant="destructive"
        confirmLabel="Disburse"
        onConfirm={doDisburse}
        loading={processing}
      />
    </div>
  )
}
