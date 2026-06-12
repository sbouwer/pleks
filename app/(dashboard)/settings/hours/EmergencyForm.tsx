"use client"

/**
 * app/(dashboard)/settings/hours/EmergencyForm.tsx — After-hours emergency contact panel (Organisation → Emergency tab)
 *
 * Route:  /settings/details?tab=emergency
 * Auth:   gateway (dashboard layout)
 * Data:   initialData passed as props; PATCH /api/org/details
 * Notes:  Split out of the old Hours form so opening hours and after-hours contact are distinct tabs.
 *         Header is provided by the Organisation DetailPageLayout — this panel renders the card + save only.
 */
import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ActionButton } from "@/components/ui/actions"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { Phone } from "lucide-react"

function F({ label, id, required, help, children }: Readonly<{
  label: string; id?: string; required?: boolean; help?: string; children: React.ReactNode
}>) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>
        {label}{required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {children}
      {help && <p className="text-xs text-muted-foreground">{help}</p>}
    </div>
  )
}

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
      if (res.ok) {
        toast.success("Emergency contact saved")
      } else {
        toast.error("Failed to save")
      }
    } catch {
      toast.error("Failed to save")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <Card className="mb-4">
        <CardHeader><CardTitle className="text-base">After-Hours Emergency</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <F label="Emergency phone" id="emergency_phone">
              <Input id="emergency_phone" type="tel" value={form.emergency_phone ?? ""}
                onChange={(e) => set("emergency_phone", e.target.value)} placeholder="082 999 8888" />
            </F>
            <F label="Contact name" id="emergency_contact_name" help="Person or service name">
              <Input id="emergency_contact_name" value={form.emergency_contact_name ?? ""}
                onChange={(e) => set("emergency_contact_name", e.target.value)} placeholder="Cape Emergency Services" />
            </F>
          </div>
          <F label="Emergency email" id="emergency_email">
            <Input id="emergency_email" type="email" value={form.emergency_email ?? ""}
              onChange={(e) => set("emergency_email", e.target.value)} placeholder="emergency@agency.co.za" />
          </F>
          <F label="Emergency instructions" id="emergency_instructions" help="Shown to tenants — keep brief">
            <textarea
              id="emergency_instructions"
              value={form.emergency_instructions ?? ""}
              onChange={(e) => set("emergency_instructions", e.target.value)}
              placeholder="For burst pipes, close the main stopcock before calling."
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </F>
          <div className="flex items-start gap-2 text-xs text-muted-foreground rounded-lg border border-border/50 bg-muted/30 px-3 py-2.5">
            <Phone className="size-3.5 shrink-0 mt-0.5" />
            <span>If no emergency phone is set, your office number will be used as the emergency contact.</span>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end pt-2">
        <ActionButton tone="primary" onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save changes"}</ActionButton>
      </div>
    </div>
  )
}
