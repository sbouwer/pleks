"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Trash2, Plus } from "lucide-react"

interface ContactPhone {
  id: string
  number: string
  phone_type: string
  label: string | null
  is_primary: boolean
  can_whatsapp: boolean
}

interface ContactEmail {
  id: string
  email: string
  email_type: string
  label: string | null
  is_primary: boolean
}

interface ContactEditFormProps {
  entityType: "landlords" | "tenants" | "contractors"
  entityId: string
  phones: ContactPhone[]
  emails: ContactEmail[]
  onSaved: () => void
}

export function ContactEditForm({ entityType, entityId, phones: initialPhones, emails: initialEmails, onSaved }: Readonly<ContactEditFormProps>) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [phones, setPhones] = useState(initialPhones)
  const [emails, setEmails] = useState(initialEmails)

  const baseUrl = `/api/${entityType}/${entityId}/contact-details`

  async function saveAll() {
    // Save all phone/email changes
    await Promise.all(phones.map(async (phone) => {
      await fetch(baseUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "phone", id: phone.id, number: phone.number, phone_type: phone.phone_type, is_primary: phone.is_primary, can_whatsapp: phone.can_whatsapp }),
      })
    }))
    await Promise.all(emails.map(async (email) => {
      await fetch(baseUrl, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "email", id: email.id, email: email.email, email_type: email.email_type, is_primary: email.is_primary }),
      })
    }))
  }

  async function addPhone() {
    const res = await fetch(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "phone", number: "", phone_type: "mobile", is_primary: phones.length === 0, can_whatsapp: false }),
    })
    if (res.ok) {
      const data = await res.json()
      setPhones((prev) => [...prev, { id: data.id, number: "", phone_type: "mobile", label: null, is_primary: prev.length === 0, can_whatsapp: false }])
    }
  }

  async function deletePhone(id: string) {
    await fetch(baseUrl, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "phone", id }) })
    setPhones((prev) => prev.filter((p) => p.id !== id))
  }

  async function addEmail() {
    const res = await fetch(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "email", email: "", email_type: "personal", is_primary: emails.length === 0 }),
    })
    if (res.ok) {
      const data = await res.json()
      setEmails((prev) => [...prev, { id: data.id, email: "", email_type: "personal", label: null, is_primary: prev.length === 0 }])
    }
  }

  async function deleteEmail(id: string) {
    await fetch(baseUrl, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "email", id }) })
    setEmails((prev) => prev.filter((e) => e.id !== id))
  }

  function handleSave() {
    startTransition(async () => {
      try {
        await saveAll()
        toast.success("Contact details saved")
        router.refresh()
        onSaved()
      } catch {
        toast.error("Failed to save")
      }
    })
  }

  return (
    <div className="space-y-4">
      <div>
        <Label className="text-xs text-muted-foreground uppercase tracking-wide">Phones</Label>
        <div className="space-y-2 mt-1">
          {phones.map((phone) => (
            <div key={phone.id} className="flex gap-1.5 items-center">
              <Input value={phone.number} onChange={(e) => setPhones((prev) => prev.map((p) => p.id === phone.id ? { ...p, number: e.target.value } : p))} placeholder="Phone number" className="h-8 text-sm" />
              <Select value={phone.phone_type} onValueChange={(v) => setPhones((prev) => prev.map((p) => p.id === phone.id ? { ...p, phone_type: v ?? "mobile" } : p))}>
                <SelectTrigger className="h-8 w-24 text-xs shrink-0"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mobile">Mobile</SelectItem>
                  <SelectItem value="landline">Landline</SelectItem>
                  <SelectItem value="work">Work</SelectItem>
                </SelectContent>
              </Select>
              <button type="button" onClick={() => deletePhone(phone.id)} className="text-muted-foreground hover:text-danger shrink-0"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
          <button type="button" onClick={addPhone} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><Plus className="h-3 w-3" /> Add phone</button>
        </div>
      </div>
      <div>
        <Label className="text-xs text-muted-foreground uppercase tracking-wide">Emails</Label>
        <div className="space-y-2 mt-1">
          {emails.map((email) => (
            <div key={email.id} className="flex gap-1.5 items-center">
              <Input value={email.email} onChange={(e) => setEmails((prev) => prev.map((em) => em.id === email.id ? { ...em, email: e.target.value } : em))} placeholder="Email address" type="email" className="h-8 text-sm" />
              <Select value={email.email_type} onValueChange={(v) => setEmails((prev) => prev.map((em) => em.id === email.id ? { ...em, email_type: v ?? "personal" } : em))}>
                <SelectTrigger className="h-8 w-24 text-xs shrink-0"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="personal">Personal</SelectItem>
                  <SelectItem value="work">Work</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
              <button type="button" onClick={() => deleteEmail(email.id)} className="text-muted-foreground hover:text-danger shrink-0"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
          <button type="button" onClick={addEmail} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"><Plus className="h-3 w-3" /> Add email</button>
        </div>
      </div>
      <div className="flex gap-2 pt-1"><Button size="sm" onClick={handleSave} disabled={isPending} className="h-7 text-xs">{isPending ? "Saving…" : "Save"}</Button><Button size="sm" variant="outline" onClick={onSaved} disabled={isPending} className="h-7 text-xs">Cancel</Button></div>
    </div>
  )
}
