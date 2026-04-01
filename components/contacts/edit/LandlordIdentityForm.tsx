"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

interface LandlordIdentityFormProps {
  landlordId: string
  contactId: string
  entityType: string
  firstName: string | null
  lastName: string | null
  companyName: string | null
  tradingAs: string | null
  registrationNumber: string | null
  vatNumber: string | null
  notes: string | null
  onSaved: () => void
}

export function LandlordIdentityForm({
  landlordId, contactId, entityType, firstName, lastName, companyName, tradingAs, registrationNumber, vatNumber, notes, onSaved
}: Readonly<LandlordIdentityFormProps>) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [type, setType] = useState(entityType)
  const [form, setForm] = useState({
    first_name: firstName ?? "",
    last_name: lastName ?? "",
    company_name: companyName ?? "",
    trading_as: tradingAs ?? "",
    registration_number: registrationNumber ?? "",
    vat_number: vatNumber ?? "",
    notes: notes ?? "",
  })

  function handleSave() {
    startTransition(async () => {
      try {
        const res = await fetch("/api/landlords", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ landlordId, contactId, entity_type: type, ...form }),
        })
        if (!res.ok) throw new Error()
        toast.success("Saved")
        router.refresh()
        onSaved()
      } catch {
        toast.error("Failed to save")
      }
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <button type="button" onClick={() => setType("individual")} className={`flex-1 py-1.5 text-xs rounded border transition-colors ${type === "individual" ? "bg-brand text-white border-brand" : "border-border text-muted-foreground"}`}>Individual</button>
        <button type="button" onClick={() => setType("organisation")} className={`flex-1 py-1.5 text-xs rounded border transition-colors ${type === "organisation" ? "bg-brand text-white border-brand" : "border-border text-muted-foreground"}`}>Company</button>
      </div>

      {type === "organisation" ? (
        <>
          <div><Label className="text-xs">Company name</Label><Input value={form.company_name} onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))} className="h-8 text-sm mt-1" /></div>
          <div><Label className="text-xs">Trading as</Label><Input value={form.trading_as} onChange={(e) => setForm((f) => ({ ...f, trading_as: e.target.value }))} className="h-8 text-sm mt-1" /></div>
          <div><Label className="text-xs">Registration no.</Label><Input value={form.registration_number} onChange={(e) => setForm((f) => ({ ...f, registration_number: e.target.value }))} className="h-8 text-sm mt-1" /></div>
          <div><Label className="text-xs">VAT no.</Label><Input value={form.vat_number} onChange={(e) => setForm((f) => ({ ...f, vat_number: e.target.value }))} className="h-8 text-sm mt-1" /></div>
        </>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <div><Label className="text-xs">First name</Label><Input value={form.first_name} onChange={(e) => setForm((f) => ({ ...f, first_name: e.target.value }))} className="h-8 text-sm mt-1" /></div>
          <div><Label className="text-xs">Last name</Label><Input value={form.last_name} onChange={(e) => setForm((f) => ({ ...f, last_name: e.target.value }))} className="h-8 text-sm mt-1" /></div>
        </div>
      )}

      <div><Label className="text-xs">Notes</Label><Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} className="text-sm mt-1" /></div>

      <div className="flex gap-2"><Button size="sm" onClick={handleSave} disabled={isPending} className="h-7 text-xs">{isPending ? "Saving…" : "Save"}</Button><Button size="sm" variant="outline" onClick={onSaved} disabled={isPending} className="h-7 text-xs">Cancel</Button></div>
    </div>
  )
}
