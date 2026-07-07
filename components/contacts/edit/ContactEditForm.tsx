"use client"

/**
 * components/contacts/edit/ContactEditForm.tsx — client form to edit a contact's phone numbers and email addresses
 *
 * Data:   Persists via the entity's API route (landlords/tenants/contractors), then router.refresh().
 */
import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ActionButton, AddInline, RemoveButton } from "@/components/ui/actions"

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
              <RemoveButton label="Remove phone" onClick={() => deletePhone(phone.id)} className="shrink-0" />
            </div>
          ))}
          <AddInline label="Add phone" size="sm" onClick={addPhone} />
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
              <RemoveButton label="Remove email" onClick={() => deleteEmail(email.id)} className="shrink-0" />
            </div>
          ))}
          <AddInline label="Add email" size="sm" onClick={addEmail} />
        </div>
      </div>
      <div className="flex gap-2 pt-1"><ActionButton tone="primary" size="sm" onClick={handleSave} disabled={isPending}>{isPending ? "Saving…" : "Save"}</ActionButton><ActionButton tone="secondary" size="sm" onClick={onSaved} disabled={isPending}>Cancel</ActionButton></div>
    </div>
  )
}
