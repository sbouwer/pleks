"use client"

/**
 * components/contacts/edit/LandlordBankingForm.tsx — inline edit for a landlord's tax number + payment method
 *
 * Auth:   PATCH /api/landlords (membership-gated) — updates landlords.tax_number / payment_method
 * Data:   landlords table (tax_number, payment_method)
 * Notes:  bank accounts moved to contact_bank_accounts — edited via BankAccountsSection, not here. This form
 *         now only owns the SARS tax number (owner statements) + payout payment method.
 */
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface LandlordBankingFormProps {
  landlordId: string
  contactId: string
  taxNumber: string | null
  paymentMethod: string | null
  onSaved: () => void
}

export function LandlordBankingForm({
  landlordId, contactId, taxNumber, paymentMethod, onSaved,
}: Readonly<LandlordBankingFormProps>) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [form, setForm] = useState({
    tax_number: taxNumber ?? "",
    payment_method: paymentMethod ?? "",
  })

  function handleSave() {
    startTransition(async () => {
      try {
        const res = await fetch("/api/landlords", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ landlordId, contactId, taxNumber: form.tax_number, paymentMethod: form.payment_method }),
        })
        if (!res.ok) throw new Error()
        toast.success("Payment details saved")
        router.refresh()
        onSaved()
      } catch {
        toast.error("Failed to save")
      }
    })
  }

  return (
    <div className="space-y-2">
      <div><Label className="text-xs">Tax number</Label><Input value={form.tax_number} onChange={(e) => setForm((f) => ({ ...f, tax_number: e.target.value }))} className="h-8 text-sm mt-1" /></div>
      <div>
        <Label className="text-xs">Payment method</Label>
        <Select value={form.payment_method} onValueChange={(v) => setForm((f) => ({ ...f, payment_method: v ?? "" }))}>
          <SelectTrigger className="h-8 text-sm mt-1"><SelectValue placeholder="Select method" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="eft">EFT</SelectItem>
            <SelectItem value="cash">Cash</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex gap-2 pt-1"><Button size="sm" onClick={handleSave} disabled={isPending} className="h-7 text-xs">{isPending ? "Saving…" : "Save"}</Button><Button size="sm" variant="outline" onClick={onSaved} disabled={isPending} className="h-7 text-xs">Cancel</Button></div>
    </div>
  )
}
