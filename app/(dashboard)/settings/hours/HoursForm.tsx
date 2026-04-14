"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { Phone } from "lucide-react"

// ── Shared primitives (copied from ProfileForm.tsx) ───────────────────────────

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

/** Parse stored "HH:MM–HH:MM" string into time parts. Returns closed=true when null/empty. */
function parseDayHours(value: string | null): { start: string; end: string; closed: boolean } {
  if (!value) return { start: "08:00", end: "17:00", closed: true }
  const match = /^(\d{2}:\d{2})[–-](\d{2}:\d{2})$/.exec(value)
  if (match) return { start: match[1], end: match[2], closed: false }
  return { start: "08:00", end: "17:00", closed: true }
}

/** Format time parts back to stored string, or null when closed. */
function formatDayHours(start: string, end: string, closed: boolean): string {
  if (closed) return ""
  return `${start}–${end}`
}

interface DayRowProps {
  label: string
  value: string | null
  defaultStart?: string
  defaultEnd?: string
  onChange: (v: string) => void
}

function DayHoursRow({ label, value, defaultStart = "08:00", defaultEnd = "17:00", onChange }: Readonly<DayRowProps>) {
  const parsed = parseDayHours(value)
  const isClosed = parsed.closed
  const start = isClosed ? defaultStart : parsed.start
  const end = isClosed ? defaultEnd : parsed.end

  function handleClosed(checked: boolean) {
    onChange(formatDayHours(start, end, checked))
  }
  function handleStart(v: string) {
    onChange(formatDayHours(v, end, isClosed))
  }
  function handleEnd(v: string) {
    onChange(formatDayHours(start, v, isClosed))
  }

  return (
    <div className="grid grid-cols-[100px_1fr_1fr_auto] items-center gap-x-3 gap-y-0">
      <span className="text-sm">{label}</span>
      <Input
        type="time"
        value={start}
        disabled={isClosed}
        onChange={(e) => handleStart(e.target.value)}
        className="h-8 text-sm disabled:opacity-40"
      />
      <Input
        type="time"
        value={end}
        disabled={isClosed}
        onChange={(e) => handleEnd(e.target.value)}
        className="h-8 text-sm disabled:opacity-40"
      />
      <label className="flex items-center gap-1.5 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={isClosed}
          onChange={(e) => handleClosed(e.target.checked)}
          className="h-3.5 w-3.5 accent-brand cursor-pointer"
        />
        <span className="text-xs text-muted-foreground">Closed</span>
      </label>
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

interface HoursData {
  office_hours_weekday: string | null
  office_hours_saturday: string | null
  office_hours_sunday: string | null
  office_hours_public_holidays: string | null
  emergency_phone: string | null
  emergency_contact_name: string | null
  emergency_instructions: string | null
  emergency_email: string | null
}

export function HoursForm({ initialData }: Readonly<{ initialData: HoursData }>) {
  const [form, setForm] = useState<HoursData>(initialData)
  const [saving, setSaving] = useState(false)

  function set(field: keyof HoursData, value: string) {
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
        toast.success("Hours saved")
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
      <h1 className="font-heading text-3xl mb-6">Opening Hours &amp; Emergency Contact</h1>

      <Card className="mb-4">
        <CardHeader><CardTitle className="text-base">Office Hours</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {/* Column headers */}
          <div className="grid grid-cols-[100px_1fr_1fr_auto] items-center gap-x-3 mb-1">
            <span />
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Open</span>
            <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Close</span>
            <span />
          </div>
          <DayHoursRow
            label="Weekdays"
            value={form.office_hours_weekday}
            defaultStart="08:00"
            defaultEnd="17:00"
            onChange={(v) => set("office_hours_weekday", v)}
          />
          <DayHoursRow
            label="Saturdays"
            value={form.office_hours_saturday}
            defaultStart="08:00"
            defaultEnd="13:00"
            onChange={(v) => set("office_hours_saturday", v)}
          />
          <DayHoursRow
            label="Sundays"
            value={form.office_hours_sunday}
            defaultStart="08:00"
            defaultEnd="13:00"
            onChange={(v) => set("office_hours_sunday", v)}
          />
          <DayHoursRow
            label="Public holidays"
            value={form.office_hours_public_holidays}
            defaultStart="08:00"
            defaultEnd="13:00"
            onChange={(v) => set("office_hours_public_holidays", v)}
          />
        </CardContent>
      </Card>

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
        <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
      </div>
    </div>
  )
}
