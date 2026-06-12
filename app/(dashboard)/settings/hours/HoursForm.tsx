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
import { Save } from "lucide-react"
import { DetailCard } from "@/components/detail/DetailCard"
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

  const timeCls = "h-9 rounded-[var(--r-button)] border border-input bg-transparent px-2 text-sm tabular-nums transition-colors focus:border-primary focus:outline-none disabled:opacity-40 [color-scheme:dark]"
  return (
    <div className="flex items-center gap-2.5">
      <span className="w-24 shrink-0 text-sm">{label}</span>
      <input type="time" value={start} disabled={isClosed} onChange={(e) => handleStart(e.target.value)} className={timeCls} />
      <span className="text-muted-foreground">–</span>
      <input type="time" value={end} disabled={isClosed} onChange={(e) => handleEnd(e.target.value)} className={timeCls} />
      <label className="ml-auto flex cursor-pointer select-none items-center gap-1.5">
        <input
          type="checkbox"
          checked={isClosed}
          onChange={(e) => handleClosed(e.target.checked)}
          className="h-3.5 w-3.5 accent-primary cursor-pointer"
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
    <DetailCard
      title="Office hours"
      headerAction={
        <button type="button" aria-label={saving ? "Saving…" : "Save hours"} title={saving ? "Saving…" : "Save hours"}
          onClick={handleSave} disabled={saving} className="pa-edit">
          <Save className="size-3.5" />
        </button>
      }
    >
      <div className="space-y-3">
        <DayHoursRow label="Monday"    value={form.office_hours_monday}    defaultStart="08:00" defaultEnd="17:00" onChange={(v) => set("office_hours_monday", v)} />
        <DayHoursRow label="Tuesday"   value={form.office_hours_tuesday}   defaultStart="08:00" defaultEnd="17:00" onChange={(v) => set("office_hours_tuesday", v)} />
        <DayHoursRow label="Wednesday" value={form.office_hours_wednesday} defaultStart="08:00" defaultEnd="17:00" onChange={(v) => set("office_hours_wednesday", v)} />
        <DayHoursRow label="Thursday"  value={form.office_hours_thursday}  defaultStart="08:00" defaultEnd="17:00" onChange={(v) => set("office_hours_thursday", v)} />
        <DayHoursRow label="Friday"    value={form.office_hours_friday}    defaultStart="08:00" defaultEnd="15:00" onChange={(v) => set("office_hours_friday", v)} />
        <DayHoursRow label="Saturday"  value={form.office_hours_saturday}  defaultStart="08:00" defaultEnd="13:00" onChange={(v) => set("office_hours_saturday", v)} />
        <DayHoursRow label="Sunday"    value={form.office_hours_sunday}    defaultStart="08:00" defaultEnd="13:00" onChange={(v) => set("office_hours_sunday", v)} />
        <DayHoursRow label="Public holidays" value={form.office_hours_public_holidays} defaultStart="08:00" defaultEnd="13:00" onChange={(v) => set("office_hours_public_holidays", v)} />
      </div>
    </DetailCard>
  )
}
