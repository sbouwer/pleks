"use client"

/**
 * app/(tenant)/tenant/account/PortalAccountClient.tsx — editable tenant contact details (name/ID read-only)
 *
 * Auth:   rendered inside the tenant portal (session-guarded layout); writes via updatePortalContactDetails
 * Data:   contact phones/emails passed from the server page; primary phone/email are editable
 * Notes:  Canon DetailCard + forms/fields (door style). Name + ID are agent-managed, shown masked.
 */

import { useState } from "react"
import { ActionButton } from "@/components/ui/actions"
import { DetailCard } from "@/components/detail/DetailCard"
import { TextField } from "@/components/forms/fields"
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
    <div className="max-w-lg space-y-4">
      <DetailCard title="Identity">
        <div className="space-y-2 text-sm">
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">Name</span>
            <span className="text-right font-medium text-foreground">{displayName}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-muted-foreground">ID number</span>
            <span className="font-mono text-foreground">{maskId(idNumber)}</span>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Name and ID are managed by your agent.</p>
      </DetailCard>

      <DetailCard title="Contact details">
        <div className="space-y-4">
          <TextField label="Phone number" value={phone} onChange={setPhone} type="tel" placeholder="+27 XX XXX XXXX" />
          <TextField label="Email address" value={email} onChange={setEmail} type="email" placeholder="you@example.com" />
          <ActionButton tone="primary" size="sm" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </ActionButton>
        </div>
      </DetailCard>
    </div>
  )
}
