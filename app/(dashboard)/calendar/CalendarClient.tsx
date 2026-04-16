"use client"

import { useCallback, useMemo, useRef, useState } from "react"
import FullCalendar from "@fullcalendar/react"
import dayGridPlugin from "@fullcalendar/daygrid"
import timeGridPlugin from "@fullcalendar/timegrid"
import listPlugin from "@fullcalendar/list"
import interactionPlugin from "@fullcalendar/interaction"
import type { EventClickArg, EventContentArg } from "@fullcalendar/core"
import { useRouter } from "next/navigation"
import type { CalendarEvent, EventType } from "@/lib/calendar/events"
import { FormSelect } from "@/components/ui/FormSelect"

interface CalendarClientProps {
  events: CalendarEvent[]
  properties: { id: string; name: string }[]
  isFirm: boolean
}

const EVENT_TYPE_LABELS: Record<EventType, string> = {
  inspection: "Inspections",
  inspection_overdue: "Inspections",
  maintenance: "Maintenance",
  lease_expiry: "Lease deadlines",
  cpa_deadline: "Legal deadlines",
  deposit_deadline: "Legal deadlines",
  move_in: "Move-in / out",
  move_out: "Move-in / out",
}

const FILTER_GROUPS = [
  { label: "All types", value: "all" },
  { label: "Inspections", value: "inspections" },
  { label: "Maintenance", value: "maintenance" },
  { label: "Lease deadlines", value: "lease" },
  { label: "Legal deadlines", value: "legal" },
  { label: "Move-in / out", value: "moves" },
]

function eventMatchesFilter(eventType: EventType, filter: string): boolean {
  if (filter === "all") return true
  if (filter === "inspections") return eventType === "inspection" || eventType === "inspection_overdue"
  if (filter === "maintenance") return eventType === "maintenance"
  if (filter === "lease") return eventType === "lease_expiry"
  if (filter === "legal") return eventType === "cpa_deadline" || eventType === "deposit_deadline"
  if (filter === "moves") return eventType === "move_in" || eventType === "move_out"
  return true
}

function EventContent({ info }: { info: EventContentArg }) {
  const eventType = info.event.extendedProps.eventType as EventType
  const isOverdue = eventType === "inspection_overdue" || eventType === "cpa_deadline"
  return (
    <div
      className="flex items-center gap-1 px-1 py-0.5 rounded text-[11px] font-medium truncate w-full"
      style={{ backgroundColor: info.event.backgroundColor + "20", color: info.event.backgroundColor }}
    >
      {isOverdue && <span className="shrink-0">⚠</span>}
      <span className="truncate">{info.event.title}</span>
    </div>
  )
}

export function CalendarClient({ events, properties, isFirm }: CalendarClientProps) {
  const router = useRouter()
  const calendarRef = useRef<FullCalendar>(null)
  const [typeFilter, setTypeFilter] = useState("all")
  const [propertyFilter, setPropertyFilter] = useState("all")
  const [view, setView] = useState<"dayGridMonth" | "timeGridWeek" | "timeGridDay" | "listWeek">("dayGridMonth")

  const filteredEvents = useMemo(() => {
    return events
      .filter((e) => eventMatchesFilter(e.eventType, typeFilter))
      .filter((e) => propertyFilter === "all" || e.propertyName === properties.find((p) => p.id === propertyFilter)?.name)
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
  }, [events, typeFilter, propertyFilter, properties])

  const handleEventClick = useCallback((info: EventClickArg) => {
    const link = info.event.extendedProps.link as string
    if (link) router.push(link)
  }, [router])

  function switchView(newView: typeof view) {
    setView(newView)
    calendarRef.current?.getApi().changeView(newView)
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* View tabs */}
        <div className="flex rounded-lg border border-border overflow-hidden text-sm">
          {(["dayGridMonth", "timeGridWeek", "timeGridDay", "listWeek"] as const).map((v) => {
            const labels: Record<string, string> = { dayGridMonth: "Month", timeGridWeek: "Week", timeGridDay: "Day", listWeek: "List" }
            return (
              <button
                key={v}
                onClick={() => switchView(v)}
                className={`px-3 py-1.5 transition-colors ${view === v ? "bg-brand text-white" : "text-muted-foreground hover:bg-muted"}`}
              >
                {labels[v]}
              </button>
            )
          })}
        </div>

        {/* Filters */}
        <FormSelect
          value={typeFilter}
          onValueChange={setTypeFilter}
          options={FILTER_GROUPS}
          className="rounded-lg"
        />

        <FormSelect
          value={propertyFilter}
          onValueChange={setPropertyFilter}
          placeholder="All properties"
          options={[{ value: "all", label: "All properties" }, ...properties.map((p) => ({ value: p.id, label: p.name }))]}
          className="rounded-lg"
        />
      </div>

      {/* Mobile notice for non-list views */}
      {view !== "listWeek" && (
        <p className="text-xs text-muted-foreground md:hidden">
          Tip: switch to List view for a better mobile experience.
        </p>
      )}

      {/* FullCalendar */}
      <div className="calendar-wrapper rounded-xl border border-border/60 bg-surface-elevated overflow-hidden">
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
          initialView={view}
          events={filteredEvents}
          eventContent={(info) => <EventContent info={info} />}
          eventClick={handleEventClick}
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "",
          }}
          height="auto"
          dayMaxEvents={4}
          businessHours={{ daysOfWeek: [1, 2, 3, 4, 5], startTime: "08:00", endTime: "17:00" }}
          weekends={true}
          nowIndicator={true}
          firstDay={1}
          listDayFormat={{ weekday: "long", day: "numeric", month: "long" }}
          listDaySideFormat={false}
        />
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0" />Inspection</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0" />Maintenance</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-violet-500 shrink-0" />Lease expiry</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" />Legal deadline</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-green-500 shrink-0" />Move-in</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-orange-500 shrink-0" />Move-out</span>
      </div>

      {isFirm && (
        <p className="text-xs text-muted-foreground">
          Team view is available for Firm accounts — coming soon.
        </p>
      )}
    </div>
  )
}

// Satisfy TypeScript — EVENT_TYPE_LABELS used for future extensibility
void EVENT_TYPE_LABELS
