"use client"

/**
 * app/(dashboard)/billing/municipal/[billId]/MunicipalBillActions.tsx — Confirm extraction and mark-as-paid actions for a municipal bill.
 *
 * Route:  /billing/municipal/[billId]
 * Auth:   requireAdminAuth
 * Data:   extractionStatus and paymentStatus props from parent server component; mutations via municipal server actions
 * Notes:  Confirm Extraction shown when extracted; Mark as Paid shown once confirmed and not yet paid
 */

import { ActionButton } from "@/components/ui/actions"
import { confirmMunicipalBill, markMunicipalBillPaid } from "@/lib/actions/municipal"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

interface MunicipalBillActionsProps {
  readonly billId: string
  readonly extractionStatus: string
  readonly paymentStatus: string
}

export function MunicipalBillActions({ billId, extractionStatus, paymentStatus }: MunicipalBillActionsProps) {
  const router = useRouter()

  async function handleConfirm() {
    const result = await confirmMunicipalBill(billId)
    if (result?.error) toast.error(result.error)
    else { toast.success("Bill confirmed"); router.refresh() }
  }

  async function handlePaid() {
    const result = await markMunicipalBillPaid(billId)
    if (result?.error) toast.error(result.error)
    else { toast.success("Marked as paid"); router.refresh() }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {extractionStatus === "extracted" && (
        <ActionButton tone="primary" onClick={handleConfirm}>Confirm Extraction</ActionButton>
      )}
      {paymentStatus !== "paid" && extractionStatus === "confirmed" && (
        <ActionButton tone="primary" onClick={handlePaid}>Mark as Paid</ActionButton>
      )}
    </div>
  )
}
