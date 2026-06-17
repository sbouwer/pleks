"use client"

/**
 * app/(dashboard)/settings/hours/EmergencyForm.tsx — After-hours emergency contact card (Organisation → Availability)
 *
 * Route:  /settings/details?tab=hours (right column, beside Office hours)
 * Auth:   gateway (dashboard layout)
 * Data:   initialData passed as props; PATCH /api/org/details
 * Notes:  Iconic DetailCard with a header disk-save, matching the Office hours card. Header + subtext are
 *         owned by the Organisation DetailPageLayout.
 */
import { useState } from "react"
import { Phone, Save } from "lucide-react"
import { TextField, TextareaField } from "@/components/forms/fields"
import { DetailCard } from "@/components/detail/DetailCard"
import { toast } from "sonner"

export interface EmergencyData {
  emergency_phone: string | null
  emergency_contact_name: string | null
  emergency_instructions: string | null
  emergency_email: string | null
}

export function EmergencyForm({ initialData }: Readonly<{ initialData: EmergencyData }>) {
  const [form, setForm] = useState<EmergencyData>(initialData)
  const [saving, setSaving] = useState(false)

  function set(field: keyof EmergencyData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value || null }))
  }

  async function handleSave() {
    setSaving(true)
    try {
      const res = await fetch("/api/org/details", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      })
      if (res.ok) toast.success("Emergency contact saved")
      else toast.error("Failed to save")
    } catch {
      toast.error("Failed to save")
    } finally {
      setSaving(false)
    }
  }

  return (
    <DetailCard
      title="After-hours emergency"
      headerAction={
        <button type="button" aria-label={saving ? "Saving…" : "Save emergency contact"} title={saving ? "Saving…" : "Save emergency contact"}
          onClick={handleSave} disabled={saving} className="pa-edit">
          <Save className="size-3.5" />
        </button>
      }
    >
      <div className="space-y-4">
        <TextField label="Emergency phone" value={form.emergency_phone} onChange={(v) => set("emergency_phone", v)} type="tel" placeholder="082 999 8888" />
        <TextField label="Contact name" value={form.emergency_contact_name} onChange={(v) => set("emergency_contact_name", v)} placeholder="Cape Emergency Services" />
        <TextField label="Emergency email" value={form.emergency_email} onChange={(v) => set("emergency_email", v)} type="email" placeholder="emergency@agency.co.za" />
        <TextareaField label="Emergency instructions" value={form.emergency_instructions} onChange={(v) => set("emergency_instructions", v)} placeholder="Shown to tenants — e.g. for burst pipes, close the main stopcock before calling." />

        <div className="flex items-start gap-2 rounded-[var(--r-button)] border border-border/50 bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
          <Phone className="size-3.5 shrink-0 mt-0.5" />
          <span>If no emergency phone is set, your office number will be used as the emergency contact.</span>
        </div>
      </div>
    </DetailCard>
  )
}
