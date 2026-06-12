"use client"

/**
 * app/(dashboard)/settings/hours/HoursForm.tsx — Office opening-hours panel (Organisation → Hours tab)
 *
 * Route:  /settings/details?tab=hours
 * Auth:   gateway (dashboard layout)
 * Data:   initialData passed as props; PATCH /api/org/details
 * Notes:  After-hours emergency contact lives in its own tab/panel (EmergencyForm). Header is provided by
 *         the Organisation DetailPageLayout — this panel renders the office-hours card + save only.
 */
import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ActionButton } from "@/components/ui/actions"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"

/** Parse stored "HH:MM–HH:MM" string into time parts. Returns closed=true when null/empty. */
function parseDayHours(value: string | null): { start: string; end: string; closed: boolean } {
  if (!value) return { start: "08:00", end: "17:00", closed: true }
  const match = /^(\d{2}:\d{2})[–-](\d{2}:\d{2})$/.exec(value)
  if (match) return { start: match[1], end: match[2], closed: false }
  return { start: "08:00", end: "17:00", closed: true }
}

/** Format time parts back to stored string, or empty when closed. */
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

export interface HoursData {
  office_hours_monday: string | null
  office_hours_tuesday: string | null
  office_hours_wednesday: string | null
  office_hours_thursday: string | null
  office_hours_friday: string | null
  office_hours_saturday: string | null
  office_hours_sunday: string | null
  office_hours_public_holidays: string | null
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
          <DayHoursRow label="Monday"    value={form.office_hours_monday}    defaultStart="08:00" defaultEnd="17:00" onChange={(v) => set("office_hours_monday", v)} />
          <DayHoursRow label="Tuesday"   value={form.office_hours_tuesday}   defaultStart="08:00" defaultEnd="17:00" onChange={(v) => set("office_hours_tuesday", v)} />
          <DayHoursRow label="Wednesday" value={form.office_hours_wednesday} defaultStart="08:00" defaultEnd="17:00" onChange={(v) => set("office_hours_wednesday", v)} />
          <DayHoursRow label="Thursday"  value={form.office_hours_thursday}  defaultStart="08:00" defaultEnd="17:00" onChange={(v) => set("office_hours_thursday", v)} />
          <DayHoursRow label="Friday"    value={form.office_hours_friday}    defaultStart="08:00" defaultEnd="15:00" onChange={(v) => set("office_hours_friday", v)} />
          <DayHoursRow label="Saturday"  value={form.office_hours_saturday}  defaultStart="08:00" defaultEnd="13:00" onChange={(v) => set("office_hours_saturday", v)} />
          <DayHoursRow label="Sunday"    value={form.office_hours_sunday}    defaultStart="08:00" defaultEnd="13:00" onChange={(v) => set("office_hours_sunday", v)} />
          <DayHoursRow label="Public holidays" value={form.office_hours_public_holidays} defaultStart="08:00" defaultEnd="13:00" onChange={(v) => set("office_hours_public_holidays", v)} />
        </CardContent>
      </Card>

      <div className="flex justify-end pt-2">
        <ActionButton tone="primary" onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save changes"}</ActionButton>
      </div>
    </div>
  )
}
