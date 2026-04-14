"use client"

import { useState, useRef, useEffect } from "react"
import { ChevronLeft, ChevronRight, CalendarIcon } from "lucide-react"
import {
  format,
  getDaysInMonth,
  startOfMonth,
  getDay,
  addMonths,
  subMonths,
} from "date-fns"

interface DatePickerInputProps {
  value: string           // YYYY-MM-DD or ""
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

export function DatePickerInput({
  value,
  onChange,
  placeholder = "Select date",
  className = "",
}: Readonly<DatePickerInputProps>) {
  // Use local-time parse to avoid UTC offset shifting the day
  const selected = value ? new Date(`${value}T00:00:00`) : null
  const [open, setOpen] = useState(false)
  const [viewDate, setViewDate] = useState<Date>(selected ?? new Date())
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])


  function handleDayClick(day: number) {
    const d = new Date(viewDate.getFullYear(), viewDate.getMonth(), day)
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, "0")
    const dd = String(d.getDate()).padStart(2, "0")
    onChange(`${y}-${m}-${dd}`)
  }

  function handleClear() {
    onChange("")
    setOpen(false)
  }

  // Build calendar grid
  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const daysInMonth = getDaysInMonth(viewDate)
  const firstDayOfWeek = getDay(startOfMonth(viewDate)) // 0 = Sun

  const cells: (number | null)[] = [
    ...Array(firstDayOfWeek).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  const today = new Date()
  function isToday(day: number) {
    return day === today.getDate() && month === today.getMonth() && year === today.getFullYear()
  }
  function isSelected(day: number) {
    return !!selected && day === selected.getDate() && month === selected.getMonth() && year === selected.getFullYear()
  }

  const displayLabel = selected ? format(selected, "dd MMM yyyy") : null

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-[140px] items-center gap-2 rounded-md border border-input bg-transparent px-3 text-left text-sm transition-colors hover:bg-muted/50"
      >
        <CalendarIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className={displayLabel ? "text-foreground" : "text-muted-foreground truncate"}>
          {displayLabel ?? placeholder}
        </span>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-xl border border-border/60 bg-popover p-3 shadow-lg">
          {/* Month navigation */}
          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setViewDate(subMonths(viewDate, 1))}
              className="rounded p-1 transition-colors hover:bg-muted"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm font-medium">{format(viewDate, "MMMM yyyy")}</span>
            <button
              type="button"
              onClick={() => setViewDate(addMonths(viewDate, 1))}
              className="rounded p-1 transition-colors hover:bg-muted"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* Day-of-week headers */}
          <div className="mb-1 grid grid-cols-7 text-center">
            {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
              <div key={d} className="py-1 text-[10px] font-medium text-muted-foreground">{d}</div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-y-0.5 text-center">
            {cells.map((day, i) => {
              if (!day) return <div key={`e${i}`} />
              const sel = isSelected(day)
              const tod = isToday(day)
              let dayClass = "text-foreground hover:bg-muted"
              if (sel) dayClass = "bg-brand text-white"
              else if (tod) dayClass = "ring-1 ring-brand text-brand"
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => handleDayClick(day)}
                  className={`mx-auto flex h-8 w-8 items-center justify-center rounded-full text-xs font-medium transition-colors ${dayClass}`}
                >
                  {day}
                </button>
              )
            })}
          </div>

          {/* Footer */}
          <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
            <button
              type="button"
              onClick={handleClear}
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md bg-brand px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-brand/90"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
