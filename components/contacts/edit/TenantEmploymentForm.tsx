"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface TenantEmploymentFormProps {
  tenantId: string
  employerName: string | null
  employerPhone: string | null
  occupation: string | null
  employmentType: string | null
  preferredContact: string | null
  onSaved: () => void
}

export function TenantEmploymentForm({
  tenantId, employerName, employerPhone, occupation, employmentType, preferredContact, onSaved
}: Readonly<TenantEmploymentFormProps>) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [form, setForm] = useState({
    employer_name: employerName ?? "",
    employer_phone: employerPhone ?? "",
    occupation: occupation ?? "",
    employment_type: employmentType ?? "",
    preferred_contact: preferredContact ?? "",
  })

  function handleSave() {
    startTransition(async () => {
      try {
        const res = await fetch("/api/tenants", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: tenantId, ...form }),
        })
        if (!res.ok) throw new Error()
        toast.success("Employment details saved")
        router.refresh()
        onSaved()
      } catch {
        toast.error("Failed to save")
      }
    })
  }

  return (
    <div className="space-y-2">
      <div><Label className="text-xs">Employer</Label><Input value={form.employer_name} onChange={(e) => setForm((f) => ({ ...f, employer_name: e.target.value }))} className="h-8 text-sm mt-1" /></div>
      <div><Label className="text-xs">Employer phone</Label><Input value={form.employer_phone} onChange={(e) => setForm((f) => ({ ...f, employer_phone: e.target.value }))} className="h-8 text-sm mt-1" /></div>
      <div><Label className="text-xs">Occupation</Label><Input value={form.occupation} onChange={(e) => setForm((f) => ({ ...f, occupation: e.target.value }))} className="h-8 text-sm mt-1" /></div>
      <div>
        <Label className="text-xs">Employment type</Label>
        <Select value={form.employment_type} onValueChange={(v) => setForm((f) => ({ ...f, employment_type: v ?? "" }))}>
          <SelectTrigger className="h-8 text-sm mt-1"><SelectValue placeholder="Select type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="permanent">Permanent</SelectItem>
            <SelectItem value="contract">Contract</SelectItem>
            <SelectItem value="self_employed">Self-employed</SelectItem>
            <SelectItem value="unemployed">Unemployed</SelectItem>
            <SelectItem value="retired">Retired</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">Preferred contact</Label>
        <Select value={form.preferred_contact} onValueChange={(v) => setForm((f) => ({ ...f, preferred_contact: v ?? "" }))}>
          <SelectTrigger className="h-8 text-sm mt-1"><SelectValue placeholder="Select" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="phone">Phone</SelectItem>
            <SelectItem value="email">Email</SelectItem>
            <SelectItem value="whatsapp">WhatsApp</SelectItem>
            <SelectItem value="sms">SMS</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex gap-2 pt-1"><Button size="sm" onClick={handleSave} disabled={isPending} className="h-7 text-xs">{isPending ? "Saving…" : "Save"}</Button><Button size="sm" variant="outline" onClick={onSaved} disabled={isPending} className="h-7 text-xs">Cancel</Button></div>
    </div>
  )
}
