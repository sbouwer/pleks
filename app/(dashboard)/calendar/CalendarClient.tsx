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
import { Search, X, Plus, ChevronDown, FileText, Wrench, ClipboardCheck, Users, User, Globe } from "lucide-react"
import { WarningBell } from "@/components/ui/WarningBell"
import { useMyTeams } from "@/hooks/useMyTeams"
import { useUser } from "@/hooks/useUser"
import { useShowScopeFilter } from "@/hooks/useShowScopeFilter"
import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { ToolbarFilter } from "@/components/ui/resource-list"
import { ResourcePageHeader } from "@/components/ui/resource-page-header"
import { Modal } from "@/components/ui/actions"
import type { CalendarEvent, EventType, CalendarSearchEntity } from "@/lib/calendar/events"
import { fmtDateZA, fmtZA } from "@/lib/dates"

const ALERT_LABEL: Record<string, string> = {
  cpa_deadline: "CPA notice missed",
  deposit_deadline: "Deposit return overdue",
  inspection_overdue: "Overdue inspection",
}

interface CalendarClientProps {
  events: CalendarEvent[]
  alerts: CalendarEvent[]
  searchEntities: CalendarSearchEntity[]
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

const QUICK_ADD_ITEMS: { key: string; label: string; icon: LucideIcon; base: string }[] = [
  { key: "lease", label: "lease", icon: FileText, base: "/leases/new" },
  { key: "maintenance", label: "maintenance", icon: Wrench, base: "/maintenance/new" },
  { key: "inspection", label: "inspection", icon: ClipboardCheck, base: "/inspections/new" },
]

/**
 * Append the search selection (and an optional clicked-on date) to an add-page URL where the
 * target accepts it:
 *   property → ?property=<id> (leases, maintenance and inspections all prefill from it)
 *   tenant   → ?tenant=<id> on /leases/new only (the other pages key off property/unit)
 *   landlord → no target param exists, so the page opens without a preselection.
 *   date     → ?date=<YYYY-MM-DD> (the inspection form prefills its scheduled date from it).
 */
function quickAddHref(
  base: string,
  selected: CalendarSearchEntity | null,
  date?: string | null,
  time?: string | null,
): string {
  const params = new URLSearchParams()
  if (selected?.type === "property") params.set("property", selected.id)
  else if (selected?.type === "tenant" && base === "/leases/new") params.set("tenant", selected.id)
  if (date) params.set("date", date)
  if (time) params.set("time", time)
  const qs = params.toString()
  return qs ? `${base}?${qs}` : base
}

/** Dashboard-style "Quick add" menu — navigation only, carrying the selection where applicable. */
function CalendarQuickAdd({ selected }: { selected: CalendarSearchEntity | null }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    function onEsc(e: KeyboardEvent) { if (e.key === "Escape") setOpen(false) }
    document.addEventListener("mousedown", onDoc)
    document.addEventListener("keydown", onEsc)
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onEsc) }
  }, [open])

  // The selection only carries to a target page for property (all) or tenant (lease) — be honest about it.
  const carries = selected !== null && (selected.type === "property" || selected.type === "tenant")

  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="group inline-flex h-11 items-center gap-2 rounded-[var(--r-button)] bg-foreground py-2.5 pl-2.5 pr-3.5 text-sm font-semibold text-background transition-colors hover:bg-primary hover:text-primary-foreground"
      >
        <span aria-hidden className="h-3.5 w-[3px] shrink-0 bg-primary transition-colors group-hover:bg-primary-foreground" />
        <Plus className="h-4 w-4" />
        Quick add
        <ChevronDown className="h-3.5 w-3.5 opacity-80" />
      </button>

      {open && (
        <div className="absolute right-0 top-[46px] z-50 min-w-[220px] overflow-hidden rounded-[var(--r-button)] border border-border bg-popover shadow-lg">
          {carries && (
            <p className="border-b border-border px-3 py-2 text-[11px] text-muted-foreground">
              Prefilled for <span className="font-medium text-foreground">{selected.name}</span>
            </p>
          )}
          {QUICK_ADD_ITEMS.map((it) => {
            const Icon = it.icon
            return (
              <button
                key={it.key}
                type="button"
                onClick={() => { setOpen(false); router.push(quickAddHref(it.base, selected)) }}
                className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2.5 text-left text-[13px] text-foreground transition-colors hover:bg-muted"
              >
                <Icon className="h-4 w-4 text-muted-foreground" />
                Add {it.label}
              </button>
            )
          })}
          <div aria-hidden className="h-1 w-full bg-primary" />
        </div>
      )}
    </div>
  )
}

export function CalendarClient({ events, alerts, searchEntities }: CalendarClientProps) {
  const router = useRouter()
  const calendarRef = useRef<FullCalendar>(null)
  const [typeFilter, setTypeFilter] = useState("all")
  const [scope, setScope] = useState<"mine" | "all" | `team:${string}`>("all")
  const { teams, teamIds } = useMyTeams()
  const { user } = useUser()
  const showScope = useShowScopeFilter()  // View filter only from Growth up; below that, everything is "all"
  const effScope = showScope ? scope : "all"
  const [selectedEntity, setSelectedEntity] = useState<CalendarSearchEntity | null>(null)
  const [view, setView] = useState<CalView>("dayGridMonth")
  const [showAlerts, setShowAlerts] = useState(false)
  const [addForDate, setAddForDate] = useState<string | null>(null)
  const [addTime, setAddTime] = useState("")        // HH:MM carried to the add form (when not all-day)
  const [addAllDay, setAddAllDay] = useState(true)  // month-view clicks default to all-day; timed clicks don't

  const filteredEvents = useMemo(() => {
    return events
      .filter((e) => eventMatchesFilter(e.eventType, typeFilter))
      .filter((e) => {
        if (effScope === "all") return true
        if (effScope.startsWith("team:")) return e.teamId === effScope.slice(5)
        return e.assignedUserId === user?.id || (e.teamId != null && teamIds.includes(e.teamId))  // "mine"
      })
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
  }, [events, typeFilter, effScope, selectedEntity, user?.id, teamIds])

  const handleEventClick = useCallback((info: EventClickArg) => {
    const link = info.event.extendedProps.link as string
    if (link) router.push(link)
  }, [router])

  // Events already on the clicked day — surfaced in the add-for-day modal for clash awareness.
  // Inspections store a timestamptz date (so e.date may carry a time); compare on the date portion.
  const dayEvents = useMemo(
    () => (addForDate ? events.filter((e) => e.date.slice(0, 10) === addForDate) : []),
    [events, addForDate],
  )

  function switchView(newView: CalView) {
    setView(newView)
    calendarRef.current?.getApi().changeView(newView)
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ResourcePageHeader
        eyebrow="Operations"
        title="Calendar"
        headline="Your schedule"
        sub="Inspections, lease deadlines, legal dates and move-ins across your portfolio."
        action={
          <div className="flex items-center gap-2">
            <WarningBell
              count={alerts.length}
              label={`${alerts.length} overdue — action required`}
              onClick={() => setShowAlerts((s) => !s)}
            />
            <CalendarQuickAdd selected={selectedEntity} />
          </div>
        }
      />

      <div className="flex min-h-0 flex-1 flex-col gap-4">
      {/* Joint toolbar: view tabs · Type · search · overdue */}
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

        {showScope && (
          <ToolbarFilter
            label="View"
            selected={[scope]}
            onChange={(next) => setScope((next[0] as "mine" | "all" | `team:${string}`) ?? "all")}
            options={[
              { value: "mine", label: "My work", icon: <User /> },
              { value: "all", label: "All", icon: <Globe /> },
              ...teams.map((t) => ({ value: `team:${t.id}`, label: t.name, icon: <Users /> })),
            ]}
          />
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
          dateClick={(arg) => {
            // Month / all-day-row clicks have no time (allDay). Time-grid clicks carry the slot time.
            setAddForDate(arg.dateStr.slice(0, 10))
            setAddAllDay(arg.allDay)
            setAddTime(arg.allDay ? "" : arg.dateStr.slice(11, 16))
          }}
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
                  {fmtDateZA(a.date)}
                </p>
              </div>
              <span className="shrink-0 text-muted-foreground">→</span>
            </button>
          ))}
        </div>
      </Modal>

      <Modal
        open={addForDate !== null}
        onClose={() => setAddForDate(null)}
        title={addForDate
          ? `Add for ${fmtZA(addForDate, { weekday: "long", day: "numeric", month: "long" })}`
          : "Add"}
      >
        <div className="space-y-4">
          {/* Clash awareness — what's already booked on this day */}
          {dayEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing scheduled — the day is free.</p>
          ) : (
            <div className="space-y-1.5">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Already on this day</p>
              {dayEvents.map((e) => (
                <div key={e.id} className="flex items-center gap-2 rounded-[var(--r-button)] border border-border bg-muted/30 px-3 py-2 text-sm">
                  <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: e.colour }} />
                  <span className="min-w-0 truncate">{e.title}</span>
                  {e.time && <span className="ml-auto shrink-0 text-xs text-muted-foreground">{e.time.slice(0, 5)}</span>}
                </div>
              ))}
            </div>
          )}

          {/* When: all-day, or a specific time that carries to the form (e.g. the inspection planner) */}
          <div className="space-y-2 border-t border-border pt-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={addAllDay}
                onChange={(e) => setAddAllDay(e.target.checked)}
                className="size-4 accent-[var(--primary)]"
              />
              All-day (no specific time)
            </label>
            {!addAllDay && (
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">At</span>
                <input
                  type="time"
                  value={addTime}
                  onChange={(e) => setAddTime(e.target.value)}
                  className="h-9 rounded-[var(--r-button)] border border-border bg-card px-2.5 text-foreground outline-none transition-colors focus:border-primary/60 focus:ring-2 focus:ring-primary/15"
                />
              </div>
            )}
          </div>

          {/* Add an event for this day — carries the date, time and search selection into the form */}
          <div className="space-y-1 border-t border-border pt-3">
            {QUICK_ADD_ITEMS.map((it) => {
              const Icon = it.icon
              return (
                <button
                  key={it.key}
                  type="button"
                  onClick={() => {
                    router.push(quickAddHref(it.base, selectedEntity, addForDate, addAllDay ? null : addTime))
                    setAddForDate(null)
                  }}
                  className="flex w-full cursor-pointer items-center gap-2.5 rounded-[var(--r-button)] px-3 py-2.5 text-left text-sm text-foreground transition-colors hover:bg-muted/50"
                >
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  Add {it.label}
                </button>
              )
            })}
          </div>
        </div>
      </Modal>
      </div>
    </div>
  )
}
