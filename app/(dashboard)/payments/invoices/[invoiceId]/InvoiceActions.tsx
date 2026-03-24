"use client"

import { Button } from "@/components/ui/button"
import { approveInvoice, markInvoicePaid, rejectInvoice } from "@/lib/actions/invoices"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

interface InvoiceActionsProps {
  readonly invoiceId: string
  readonly status: string
}

export function InvoiceActions({ invoiceId, status }: InvoiceActionsProps) {
  const router = useRouter()

  async function handleApprove() {
    const result = await approveInvoice(invoiceId)
    if (result?.error) toast.error(result.error)
    else { toast.success("Invoice approved"); router.refresh() }
  }

  async function handlePay() {
    const result = await markInvoicePaid(invoiceId)
    if (result?.error) toast.error(result.error)
    else { toast.success("Marked as paid"); router.refresh() }
  }

  async function handleReject() {
    const result = await rejectInvoice(invoiceId, "Rejected by agent")
    if (result?.error) toast.error(result.error)
    else { toast.success("Invoice rejected"); router.refresh() }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {["submitted", "under_review"].includes(status) && (
        <>
          <Button size="sm" onClick={handleApprove}>Approve</Button>
          <Button size="sm" variant="outline" onClick={handleReject}>Reject</Button>
        </>
      )}
      {status === "approved" && (
        <Button size="sm" onClick={handlePay}>Mark as Paid</Button>
      )}
    </div>
  )
}
