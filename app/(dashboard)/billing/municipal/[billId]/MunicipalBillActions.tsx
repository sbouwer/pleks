"use client"

/**
 * app/(dashboard)/billing/municipal/[billId]/MunicipalBillActions.tsx — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */

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
