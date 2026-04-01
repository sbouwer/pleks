"use client"

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
  bankName: string | null
  bankAccount: string | null
  bankBranch: string | null
  bankAccountType: string | null
  taxNumber: string | null
  paymentMethod: string | null
  onSaved: () => void
}

export function LandlordBankingForm({
  landlordId, contactId, bankName, bankAccount, bankBranch, bankAccountType, taxNumber, paymentMethod, onSaved
}: Readonly<LandlordBankingFormProps>) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [form, setForm] = useState({
    bank_name: bankName ?? "",
    bank_account: bankAccount ?? "",
    bank_branch: bankBranch ?? "",
    bank_account_type: bankAccountType ?? "",
    tax_number: taxNumber ?? "",
    payment_method: paymentMethod ?? "",
  })

  function handleSave() {
    startTransition(async () => {
      try {
        const res = await fetch("/api/landlords", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ landlordId, contactId, ...form }),
        })
        if (!res.ok) throw new Error()
        toast.success("Banking details saved")
        router.refresh()
        onSaved()
      } catch {
        toast.error("Failed to save")
      }
    })
  }

  return (
    <div className="space-y-2">
      <div><Label className="text-xs">Bank name</Label><Input value={form.bank_name} onChange={(e) => setForm((f) => ({ ...f, bank_name: e.target.value }))} className="h-8 text-sm mt-1" /></div>
      <div><Label className="text-xs">Account number</Label><Input value={form.bank_account} onChange={(e) => setForm((f) => ({ ...f, bank_account: e.target.value }))} className="h-8 text-sm mt-1" /></div>
      <div><Label className="text-xs">Branch code</Label><Input value={form.bank_branch} onChange={(e) => setForm((f) => ({ ...f, bank_branch: e.target.value }))} className="h-8 text-sm mt-1" /></div>
      <div>
        <Label className="text-xs">Account type</Label>
        <Select value={form.bank_account_type} onValueChange={(v) => setForm((f) => ({ ...f, bank_account_type: v ?? "" }))}>
          <SelectTrigger className="h-8 text-sm mt-1"><SelectValue placeholder="Select type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="cheque">Cheque</SelectItem>
            <SelectItem value="savings">Savings</SelectItem>
            <SelectItem value="transmission">Transmission</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div><Label className="text-xs">Tax number</Label><Input value={form.tax_number} onChange={(e) => setForm((f) => ({ ...f, tax_number: e.target.value }))} className="h-8 text-sm mt-1" /></div>
      <div>
        <Label className="text-xs">Payment method</Label>
        <Select value={form.payment_method} onValueChange={(v) => setForm((f) => ({ ...f, payment_method: v ?? "" }))}>
          <SelectTrigger className="h-8 text-sm mt-1"><SelectValue placeholder="Select method" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="eft">EFT</SelectItem>
            <SelectItem value="cash">Cash</SelectItem>
            <SelectItem value="cheque">Cheque</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex gap-2 pt-1"><Button size="sm" onClick={handleSave} disabled={isPending} className="h-7 text-xs">{isPending ? "Saving…" : "Save"}</Button><Button size="sm" variant="outline" onClick={onSaved} disabled={isPending} className="h-7 text-xs">Cancel</Button></div>
    </div>
  )
}
