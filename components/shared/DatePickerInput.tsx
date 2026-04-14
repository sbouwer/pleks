"use client"

import { useState, useRef, useEffect } from "react"
import { ChevronLeft, ChevronRight, CalendarIcon, ChevronsLeft, ChevronsRight } from "lucide-react"
import { format, getDaysInMonth, startOfMonth, getDay, addMonths, subMonths } from "date-fns"

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
  const selected = value ? new Date(`${value}T00:00:00`) : null
  const [open, setOpen] = useState(false)
  const [viewDate, setViewDate] = useState<Date>(selected ?? new Date())
  const [mode, setMode] = useState<"day" | "year">("day")
  const [decadeStart, setDecadeStart] = useState(() => Math.floor((selected ?? new Date()).getFullYear() / 12) * 12)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
        setMode("day")
      }
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

  function handleYearClick(y: number) {
    setViewDate(new Date(y, viewDate.getMonth(), 1))
    setMode("day")
  }

  function handleClear() {
    onChange("")
    setOpen(false)
    setMode("day")
  }

  // Day grid
  const year = viewDate.getFullYear()
  const month = viewDate.getMonth()
  const daysInMonth = getDaysInMonth(viewDate)
  const firstDayOfWeek = getDay(startOfMonth(viewDate))
  const cells: (number | null)[] = [
    ...new Array<null>(firstDayOfWeek).fill(null),
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
  const years = Array.from({ length: 12 }, (_, i) => decadeStart + i)

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => { setOpen((v) => !v); setMode("day") }}
        className="flex h-9 w-[140px] items-center gap-2 rounded-md border border-input bg-transparent px-3 text-left text-sm transition-colors hover:bg-muted/50"
      >
        <CalendarIcon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className={displayLabel ? "text-foreground" : "text-muted-foreground truncate"}>
          {displayLabel ?? placeholder}
        </span>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-xl border border-border/60 bg-popover p-3 shadow-lg">

          {mode === "year" ? (
            <>
              {/* Year grid */}
              <div className="mb-3 flex items-center justify-between">
                <button type="button" onClick={() => setDecadeStart((d) => d - 12)} className="rounded p-1 transition-colors hover:bg-muted">
                  <ChevronsLeft className="h-4 w-4" />
                </button>
                <span className="text-sm font-medium">{decadeStart} – {decadeStart + 11}</span>
                <button type="button" onClick={() => setDecadeStart((d) => d + 12)} className="rounded p-1 transition-colors hover:bg-muted">
                  <ChevronsRight className="h-4 w-4" />
                </button>
              </div>
              <div className="grid grid-cols-3 gap-1">
                {years.map((y) => {
                  const isCurrentYear = y === year
                  const isTodayYear = y === today.getFullYear()
                  let cls = "rounded-lg py-2 text-xs font-medium transition-colors hover:bg-muted"
                  if (isCurrentYear) cls = "rounded-lg py-2 text-xs font-medium bg-brand text-white"
                  else if (isTodayYear) cls = "rounded-lg py-2 text-xs font-medium ring-1 ring-brand text-brand"
                  return (
                    <button key={y} type="button" onClick={() => handleYearClick(y)} className={cls}>
                      {y}
                    </button>
                  )
                })}
              </div>
              <div className="mt-3 border-t border-border pt-3">
                <button type="button" onClick={() => setMode("day")} className="text-xs text-muted-foreground transition-colors hover:text-foreground">
                  ← Back
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Month navigation */}
              <div className="mb-3 flex items-center justify-between">
                <button type="button" onClick={() => setViewDate(subMonths(viewDate, 1))} className="rounded p-1 transition-colors hover:bg-muted">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div className="flex items-center gap-1">
                  <span className="text-sm font-medium">{format(viewDate, "MMMM")}</span>
                  <button
                    type="button"
                    onClick={() => { setDecadeStart(Math.floor(year / 12) * 12); setMode("year") }}
                    className="rounded px-1 py-0.5 text-sm font-medium text-brand transition-colors hover:bg-muted"
                  >
                    {year}
                  </button>
                </div>
                <button type="button" onClick={() => setViewDate(addMonths(viewDate, 1))} className="rounded p-1 transition-colors hover:bg-muted">
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
                  if (!day) return <div key={`empty-${month}-${i}`} />
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
                <button type="button" onClick={handleClear} className="text-xs text-muted-foreground transition-colors hover:text-foreground">
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
            </>
          )}
        </div>
      )}
    </div>
  )
}
