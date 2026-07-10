"use client"

/**
 * app/(dashboard)/leases/[leaseId]/QuickPaymentButton.tsx — Inline quick-payment form for unpaid invoices
 *
 * Route:  /leases/[leaseId] (Operations tab invoice rows)
 * Auth:   gateway (dashboard layout)
 * Data:   recordPayment server action; returns a receipt number on success
 */

import { useState, useTransition, useRef } from "react"
import { DatePickerInput } from "@/components/shared/DatePickerInput"
import { ActionButton, IconButton } from "@/components/ui/actions"
import { FormSelect } from "@/components/ui/FormSelect"
import { PlusCircle, Loader2, X } from "lucide-react"
import { toast } from "sonner"
import { recordPayment } from "@/lib/actions/payments"
import { saTodayISO } from "@/lib/dates"

const PAYMENT_METHODS = [
  { value: "eft", label: "EFT" },
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
]

interface QuickPaymentButtonProps {
  readonly invoiceId: string
  readonly balanceCents: number
}

export function QuickPaymentButton({ invoiceId, balanceCents }: QuickPaymentButtonProps) {
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)

  const balanceRands = (balanceCents / 100).toFixed(2)
  const today = saTodayISO()
  const [paymentDate, setPaymentDate] = useState(today)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)
    startTransition(async () => {
      const result = await recordPayment(formData)
      if ("error" in result && result.error) {
        toast.error(result.error)
      } else {
        toast.success("Payment recorded · Receipt " + (result as { receiptNumber: string }).receiptNumber)
        setOpen(false)
        formRef.current?.reset()
      }
    })
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
      >
        <PlusCircle className="h-3.5 w-3.5" />
        Record payment
      </button>
    )
  }

  return (
    <div className="mt-3 rounded-lg border bg-muted/20 p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs font-semibold">Record payment</p>
        <IconButton
          icon={<X className="h-3.5 w-3.5" />}
          label="Close"
          onClick={() => setOpen(false)}
        />
      </div>
      <form ref={formRef} onSubmit={handleSubmit} className="space-y-3">
        <input type="hidden" name="invoice_id" value={invoiceId} />
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[11px] text-muted-foreground uppercase tracking-wide">Amount (R)</label>
            <input
              name="amount"
              type="number"
              step="0.01"
              min="0.01"
              defaultValue={balanceRands}
              required
              className="mt-1 w-full rounded-md border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground uppercase tracking-wide">Date</label>
            <div className="mt-1">
              <DatePickerInput value={paymentDate} onChange={setPaymentDate} name="payment_date" />
            </div>
          </div>
        </div>
        <div>
          <label className="text-[11px] text-muted-foreground uppercase tracking-wide">Method</label>
          <FormSelect
            name="payment_method"
            defaultValue="eft"
            options={PAYMENT_METHODS}
            className="mt-1 w-full"
          />
        </div>
        <div>
          <label className="text-[11px] text-muted-foreground uppercase tracking-wide">Reference (optional)</label>
          <input
            name="reference"
            type="text"
            placeholder="EFT ref / proof number"
            className="mt-1 w-full rounded-md border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <ActionButton
          tone="primary"
          type="submit"
          className="w-full"
          disabled={pending}
          icon={pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : undefined}
        >
          {pending ? "Recording…" : "Record payment"}
        </ActionButton>
      </form>
    </div>
  )
}
