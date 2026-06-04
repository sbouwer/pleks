"use client"

/**
 * app/(dashboard)/calendar/CalendarClient.tsx — operations calendar (FullCalendar) with the shared toolbar
 *
 * Route:  /calendar
 * Auth:   gateway (dashboard layout); Portfolio/Firm tier
 * Data:   CalendarEvent[] + overdue alerts from the server page
 * Notes:  Joint toolbar (view tabs · Type filter · entity search) matching the list pages. Search is a
 *         select-from-results combobox over property / tenant / landlord — picking one filters the calendar
 *         to its property/ies. The overdue chip opens a Modal listing the overdue items (click to navigate).
 *         Fills the viewport (FullCalendar height=100%, expandRows) and themes via --fc-* in globals.css.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import FullCalendar from "@fullcalendar/react"
import dayGridPlugin from "@fullcalendar/daygrid"
import timeGridPlugin from "@fullcalendar/timegrid"
import listPlugin from "@fullcalendar/list"
import interactionPlugin from "@fullcalendar/interaction"
import type { EventClickArg, EventContentArg } from "@fullcalendar/core"
import { useRouter } from "next/navigation"
import { AlertTriangle, Search, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { ToolbarFilter } from "@/components/ui/resource-list"
import { Modal } from "@/components/ui/actions"
import type { CalendarEvent, EventType, CalendarSearchEntity } from "@/lib/calendar/events"

const ALERT_LABEL: Record<string, string> = {
  cpa_deadline: "CPA notice missed",
  deposit_deadline: "Deposit return overdue",
  inspection_overdue: "Overdue inspection",
}

interface CalendarClientProps {
  events: CalendarEvent[]
  alerts: CalendarEvent[]
  searchEntities: CalendarSearchEntity[]
  isFirm: boolean
}

const TYPE_OPTIONS = [
  { value: "inspections", label: "Inspections" },
  { value: "maintenance", label: "Maintenance" },
  { value: "lease", label: "Lease deadlines" },
  { value: "legal", label: "Legal deadlines" },
  { value: "moves", label: "Move-in / out" },
]

const CAL_VIEWS = [
  { value: "dayGridMonth", label: "Month" },
  { value: "timeGridWeek", label: "Week" },
  { value: "timeGridDay", label: "Day" },
  { value: "listWeek", label: "List" },
] as const
type CalView = (typeof CAL_VIEWS)[number]["value"]

function eventMatchesFilter(eventType: EventType, filter: string): boolean {
  if (filter === "all") return true
  if (filter === "inspections") return eventType === "inspection" || eventType === "inspection_overdue"
  if (filter === "maintenance") return eventType === "maintenance"
  if (filter === "lease") return eventType === "lease_expiry"
  if (filter === "legal") return eventType === "cpa_deadline" || eventType === "deposit_deadline"
  if (filter === "moves") return eventType === "move_in" || eventType === "move_out"
  return true
}

/** Pick a readable text colour (near-black vs white) for a given event background, by luminance. */
function readableText(hex: string): string {
  const h = hex.replace("#", "")
  if (h.length < 6) return "#ffffff"
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "#1f2937" : "#ffffff"
}

function EventContent({ info }: { info: EventContentArg }) {
  const eventType = info.event.extendedProps.eventType as EventType
  const isOverdue = eventType === "inspection_overdue" || eventType === "cpa_deadline"
  const bg = info.event.backgroundColor
  return (
    <div
      className="flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-[11px] font-semibold"
      style={{ backgroundColor: bg, color: readableText(bg) }}
    >
      {isOverdue && <span className="shrink-0">⚠</span>}
      <span className="truncate">{info.event.title}</span>
    </div>
  )
}

const ENTITY_LABEL: Record<CalendarSearchEntity["type"], string> = {
  property: "Property",
  tenant: "Tenant",
  landlord: "Landlord",
}

/** Search-and-select combobox over property / tenant / landlord — picking one filters the calendar to its
 *  property/ies (and shows the selection as a chip, even when that entity has no events). */
function EntitySearch({
  entities, selected, onSelect, onClear,
}: Readonly<{
  entities: CalendarSearchEntity[]
  selected: CalendarSearchEntity | null
  onSelect: (e: CalendarSearchEntity) => void
  onClear: () => void
}>) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState("")
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener("mousedown", onDoc)
    return () => document.removeEventListener("mousedown", onDoc)
  }, [open])

  if (selected) {
    return (
      <div className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-[var(--r-button)] border border-primary/50 bg-card px-3.5 text-sm">
        <span className="shrink-0 text-muted-foreground">{ENTITY_LABEL[selected.type]}:</span>
        <span className="truncate font-medium">{selected.name}</span>
        <button type="button" onClick={onClear} aria-label="Clear filter" className="ml-auto shrink-0 text-muted-foreground transition-colors hover:text-foreground">
          <X className="size-4" />
        </button>
      </div>
    )
  }

  const q = text.trim().toLowerCase()
  const matches = q ? entities.filter((e) => e.name.toLowerCase().includes(q)).slice(0, 12) : []

  return (
    <div className="relative min-w-0 flex-1" ref={ref}>
      <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        value={text}
        onChange={(e) => { setText(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        placeholder="Search property, tenant or landlord…"
        className="h-11 w-full rounded-[var(--r-button)] border border-border bg-card pl-10 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/70 hover:bg-muted/30 focus:border-primary/60 focus:ring-2 focus:ring-primary/15"
      />
      {open && q.length > 0 && (
        <div className="absolute inset-x-0 top-[calc(100%+4px)] z-50 max-h-72 overflow-auto rounded-[var(--r-button)] border border-border bg-popover p-1 shadow-lg">
          {matches.length === 0 && <p className="px-2.5 py-2 text-sm text-muted-foreground">No matches.</p>}
          {matches.map((e) => (
            <button
              key={`${e.type}-${e.id}`}
              type="button"
              onClick={() => { onSelect(e); setText(""); setOpen(false) }}
              className="flex w-full items-center justify-between gap-2 rounded-[calc(var(--r-button)-1px)] px-2.5 py-2 text-left text-sm text-foreground transition-colors hover:bg-muted/50"
            >
              <span className="truncate">{e.name}</span>
              <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{ENTITY_LABEL[e.type]}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function CalendarClient({ events, alerts, searchEntities, isFirm }: CalendarClientProps) {
  const router = useRouter()
  const calendarRef = useRef<FullCalendar>(null)
  const [typeFilter, setTypeFilter] = useState("all")
  const [selectedEntity, setSelectedEntity] = useState<CalendarSearchEntity | null>(null)
  const [view, setView] = useState<CalView>("dayGridMonth")
  const [showAlerts, setShowAlerts] = useState(false)

  const filteredEvents = useMemo(() => {
    return events
      .filter((e) => eventMatchesFilter(e.eventType, typeFilter))
      .filter((e) => !selectedEntity || selectedEntity.propertyNames.includes(e.propertyName))
      .map((e) => ({
        id: e.id,
        title: e.title,
        start: e.time ? `${e.date}T${e.time}` : e.date,
        end: e.endTime ? `${e.date}T${e.endTime}` : undefined,
        allDay: e.allDay,
        backgroundColor: e.colour,
        borderColor: e.colour,
        textColor: "#ffffff",
        extendedProps: { link: e.link, eventType: e.eventType },
      }))
  }, [events, typeFilter, selectedEntity])

  const handleEventClick = useCallback((info: EventClickArg) => {
    const link = info.event.extendedProps.link as string
    if (link) router.push(link)
  }, [router])

  function switchView(newView: CalView) {
    setView(newView)
    calendarRef.current?.getApi().changeView(newView)
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {/* Joint toolbar: view tabs · Type · Property · search · overdue */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex h-11 shrink-0 items-center rounded-[var(--r-button)] border border-border bg-card p-1">
          {CAL_VIEWS.map((v) => (
            <button
              key={v.value}
              type="button"
              onClick={() => switchView(v.value)}
              className={cn(
                "flex h-full items-center rounded-[calc(var(--r-button)-2px)] px-3 text-xs font-medium transition-colors",
                view === v.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {v.label}
            </button>
          ))}
        </div>

        <ToolbarFilter
          label="Type"
          selected={typeFilter === "all" ? [] : [typeFilter]}
          onChange={(next) => setTypeFilter(next[0] ?? "all")}
          options={TYPE_OPTIONS}
        />

        <EntitySearch
          entities={searchEntities}
          selected={selectedEntity}
          onSelect={setSelectedEntity}
          onClear={() => setSelectedEntity(null)}
        />

        {alerts.length > 0 && (
          <button
            type="button"
            onClick={() => setShowAlerts((s) => !s)}
            aria-expanded={showAlerts}
            className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-[var(--r-button)] border border-danger/40 bg-danger/5 px-3.5 text-sm font-medium text-danger transition-colors hover:bg-danger/10"
          >
            <AlertTriangle className="size-4" /> {alerts.length} overdue
          </button>
        )}
      </div>

      {view !== "listWeek" && (
        <p className="shrink-0 text-xs text-muted-foreground md:hidden">
          Tip: switch to List view for a better mobile experience.
        </p>
      )}

      {/* FullCalendar — fills the remaining height */}
      <div className="calendar-wrapper min-h-0 flex-1 overflow-hidden rounded-[var(--r-button)] border border-border bg-card">
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
          initialView={view}
          events={filteredEvents}
          eventContent={(info) => <EventContent info={info} />}
          eventClick={handleEventClick}
          headerToolbar={{ left: "prev,next today", center: "title", right: "" }}
          height="100%"
          expandRows={true}
          dayMaxEvents={true}
          businessHours={{ daysOfWeek: [1, 2, 3, 4, 5], startTime: "08:00", endTime: "17:00" }}
          weekends={true}
          nowIndicator={true}
          firstDay={1}
          listDayFormat={{ weekday: "long", day: "numeric", month: "long" }}
          listDaySideFormat={false}
        />
      </div>

      {/* Legend */}
      <div className="flex shrink-0 flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 shrink-0 rounded-full bg-blue-500" />Inspection</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 shrink-0 rounded-full bg-amber-500" />Maintenance</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 shrink-0 rounded-full bg-violet-500" />Lease expiry</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 shrink-0 rounded-full bg-red-500" />Legal deadline</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 shrink-0 rounded-full bg-green-500" />Move-in</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 shrink-0 rounded-full bg-orange-500" />Move-out</span>
      </div>

      {isFirm && (
        <p className="shrink-0 text-xs text-muted-foreground">
          Team view is available for Firm accounts — coming soon.
        </p>
      )}

      <Modal open={showAlerts} onClose={() => setShowAlerts(false)} title="Overdue items">
        <div className="space-y-1">
          {alerts.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => { router.push(a.link); setShowAlerts(false) }}
              className="flex w-full items-center justify-between gap-3 rounded-[var(--r-button)] px-3 py-2.5 text-left transition-colors hover:bg-muted/50"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium">{ALERT_LABEL[a.eventType] ?? a.title}</p>
                <p className="text-xs text-muted-foreground">
                  {a.unitNumber ?? "Unit"}{a.propertyName ? `, ${a.propertyName}` : ""}
                  {" · "}
                  {new Date(a.date).toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })}
                </p>
              </div>
              <span className="shrink-0 text-muted-foreground">→</span>
            </button>
          ))}
        </div>
      </Modal>
    </div>
  )
}
