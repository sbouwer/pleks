"use client"

import { Button } from "@/components/ui/button"
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
        <Button size="sm" onClick={handleConfirm}>Confirm Extraction</Button>
      )}
      {paymentStatus !== "paid" && extractionStatus === "confirmed" && (
        <Button size="sm" onClick={handlePaid}>Mark as Paid</Button>
      )}
    </div>
  )
}
