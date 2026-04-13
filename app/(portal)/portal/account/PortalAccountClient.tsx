"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { updatePortalContactDetails } from "./actions"

interface Props {
  readonly contactId: string
  readonly orgId: string
  readonly firstName: string | null
  readonly lastName: string | null
  readonly companyName: string | null
  readonly idNumber: string | null
  readonly phones: { id: string; number: string; phone_type: string; is_primary: boolean; can_whatsapp: boolean }[]
  readonly emails: { id: string; email: string; email_type: string; is_primary: boolean }[]
}

function maskId(idNumber: string | null) {
  if (!idNumber || idNumber.length < 6) return "••••••••••"
  return "••••••" + idNumber.slice(6)
}

export function PortalAccountClient({
  contactId,
  orgId,
  firstName,
  lastName,
  companyName,
  idNumber,
  phones,
  emails,
}: Props) {
  const primaryPhone = phones.find((p) => p.is_primary) ?? phones[0]
  const primaryEmail = emails.find((e) => e.is_primary) ?? emails[0]

  const [phone, setPhone] = useState(primaryPhone?.number ?? "")
  const [email, setEmail] = useState(primaryEmail?.email ?? "")
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    const result = await updatePortalContactDetails({
      contactId,
      orgId,
      phone: phone.trim() || null,
      email: email.trim() || null,
      primaryPhoneId: primaryPhone?.id ?? null,
      primaryEmailId: primaryEmail?.id ?? null,
    })
    setSaving(false)

    if (result.error) {
      toast.error(result.error)
    } else {
      toast.success("Contact details updated")
    }
  }

  const displayName = companyName || `${firstName ?? ""} ${lastName ?? ""}`.trim() || "—"

  return (
    <div className="max-w-lg space-y-6">

      {/* Read-only identity */}
      <div className="rounded-xl border border-border/60 bg-card px-5 py-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">Identity</p>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Name</span>
            <span className="font-medium">{displayName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">ID number</span>
            <span className="font-mono">{maskId(idNumber)}</span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Name and ID are managed by your agent.</p>
      </div>

      {/* Editable contact details */}
      <div className="rounded-xl border border-border/60 bg-card px-5 py-4 space-y-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/70">Contact details</p>

        <div className="space-y-1.5">
          <Label className="text-xs">Phone number</Label>
          <Input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            type="tel"
            placeholder="+27 XX XXX XXXX"
            className="text-sm"
          />
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Email address</Label>
          <Input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            placeholder="you@example.com"
            className="text-sm"
          />
        </div>

        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>

    </div>
  )
}
