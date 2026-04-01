"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SA_PROVINCES } from "@/lib/constants"

interface ContactAddress {
  id: string
  street_line1: string | null
  street_line2: string | null
  suburb: string | null
  city: string | null
  province: string | null
  postal_code: string | null
  address_type: string
  is_primary: boolean
}

interface AddressEditFormProps {
  entityType: "landlords" | "tenants" | "contractors"
  entityId: string
  address: ContactAddress | null
  onSaved: () => void
}

export function AddressEditForm({ entityType, entityId, address, onSaved }: Readonly<AddressEditFormProps>) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [form, setForm] = useState({
    street_line1: address?.street_line1 ?? "",
    street_line2: address?.street_line2 ?? "",
    suburb: address?.suburb ?? "",
    city: address?.city ?? "",
    province: address?.province ?? "",
    postal_code: address?.postal_code ?? "",
    address_type: address?.address_type ?? "residential",
  })

  const baseUrl = `/api/${entityType}/${entityId}/contact-details`

  function handleSave() {
    startTransition(async () => {
      try {
        const method = address ? "PATCH" : "POST"
        const body = address
          ? { type: "address", id: address.id, ...form }
          : { type: "address", is_primary: true, ...form }
        const res = await fetch(baseUrl, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
        if (!res.ok) throw new Error()
        toast.success("Address saved")
        router.refresh()
        onSaved()
      } catch {
        toast.error("Failed to save address")
      }
    })
  }

  return (
    <div className="space-y-2">
      <div><Label className="text-xs">Street address</Label><Input value={form.street_line1} onChange={(e) => setForm((f) => ({ ...f, street_line1: e.target.value }))} className="h-8 text-sm mt-1" /></div>
      <Input value={form.street_line2} onChange={(e) => setForm((f) => ({ ...f, street_line2: e.target.value }))} className="h-8 text-sm" placeholder="Unit / building (optional)" />
      <div className="grid grid-cols-2 gap-2">
        <div><Label className="text-xs">Suburb</Label><Input value={form.suburb} onChange={(e) => setForm((f) => ({ ...f, suburb: e.target.value }))} className="h-8 text-sm mt-1" /></div>
        <div><Label className="text-xs">City</Label><Input value={form.city} onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))} className="h-8 text-sm mt-1" /></div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">Province</Label>
          <Select value={form.province} onValueChange={(v) => setForm((f) => ({ ...f, province: v ?? "" }))}>
            <SelectTrigger className="h-8 text-sm mt-1"><SelectValue placeholder="Province" /></SelectTrigger>
            <SelectContent>{SA_PROVINCES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label className="text-xs">Postal code</Label><Input value={form.postal_code} onChange={(e) => setForm((f) => ({ ...f, postal_code: e.target.value }))} className="h-8 text-sm mt-1" maxLength={4} /></div>
      </div>
      <div className="flex gap-2 pt-1"><Button size="sm" onClick={handleSave} disabled={isPending} className="h-7 text-xs">{isPending ? "Saving…" : "Save"}</Button><Button size="sm" variant="outline" onClick={onSaved} disabled={isPending} className="h-7 text-xs">Cancel</Button></div>
    </div>
  )
}
