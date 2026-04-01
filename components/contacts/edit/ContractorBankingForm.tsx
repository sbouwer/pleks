"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface ContractorBankingFormProps {
  contractorId: string
  bankingName: string | null
  bankName: string | null
  bankAccountNumber: string | null
  bankBranchCode: string | null
  bankAccountType: string | null
  onSaved: () => void
}

export function ContractorBankingForm({
  contractorId, bankingName, bankName, bankAccountNumber, bankBranchCode, bankAccountType, onSaved
}: Readonly<ContractorBankingFormProps>) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [form, setForm] = useState({
    banking_name: bankingName ?? "",
    bank_name: bankName ?? "",
    bank_account_number: bankAccountNumber ?? "",
    bank_branch_code: bankBranchCode ?? "",
    bank_account_type: bankAccountType ?? "",
  })

  function handleSave() {
    startTransition(async () => {
      try {
        const res = await fetch("/api/contractors", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: contractorId, ...form }),
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
      <div><Label className="text-xs">Account name</Label><Input value={form.banking_name} onChange={(e) => setForm((f) => ({ ...f, banking_name: e.target.value }))} className="h-8 text-sm mt-1" /></div>
      <div><Label className="text-xs">Bank</Label><Input value={form.bank_name} onChange={(e) => setForm((f) => ({ ...f, bank_name: e.target.value }))} className="h-8 text-sm mt-1" /></div>
      <div><Label className="text-xs">Account number</Label><Input value={form.bank_account_number} onChange={(e) => setForm((f) => ({ ...f, bank_account_number: e.target.value }))} className="h-8 text-sm mt-1" /></div>
      <div><Label className="text-xs">Branch code</Label><Input value={form.bank_branch_code} onChange={(e) => setForm((f) => ({ ...f, bank_branch_code: e.target.value }))} className="h-8 text-sm mt-1" /></div>
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
      <div className="flex gap-2 pt-1"><Button size="sm" onClick={handleSave} disabled={isPending} className="h-7 text-xs">{isPending ? "Saving…" : "Save"}</Button><Button size="sm" variant="outline" onClick={onSaved} disabled={isPending} className="h-7 text-xs">Cancel</Button></div>
    </div>
  )
}
