"use client"

/**
 * app/(dashboard)/billing/invoices/[invoiceId]/InvoiceActions.tsx — Approve, reject, or mark-as-paid actions for a supplier invoice.
 *
 * Route:  /billing/invoices/[invoiceId]
 * Auth:   requireAdminAuth
 * Data:   status prop from parent server component; mutations via invoices server actions
 * Notes:  Approve/Reject only shown for submitted or under_review; Mark as Paid only shown once approved
 */

import { ActionButton } from "@/components/ui/actions"
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
          <ActionButton tone="primary" onClick={handleApprove}>Approve</ActionButton>
          <ActionButton tone="destructive" onClick={handleReject}>Reject</ActionButton>
        </>
      )}
      {status === "approved" && (
        <ActionButton tone="primary" onClick={handlePay}>Mark as Paid</ActionButton>
      )}
    </div>
  )
}
