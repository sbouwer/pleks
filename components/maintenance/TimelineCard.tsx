"use client"

/**
 * components/maintenance/TimelineCard.tsx — filterable unified event timeline for maintenance detail
 *
 * Data:   pre-built TimelineEvent[] passed from server page via buildUnifiedTimeline
 * Notes:  Client for filter state only. All data is server-computed and passed as props.
 */

import { useState } from "react"
import { History } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { TimelineEvent, TimelineEventType } from "@/lib/maintenance/timeline"

interface Props {
  events: TimelineEvent[]
}

type FilterKey = "all" | TimelineEventType

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all",              label: "All" },
  { key: "status_change",    label: "Status" },
  { key: "note",             label: "Notes" },
  { key: "photo",            label: "Photos" },
  { key: "comm",             label: "Comms" },
  { key: "delay",            label: "Delays" },
  { key: "field_update",     label: "Edits" },
  { key: "quote",            label: "Quotes" },
  { key: "cost_allocation",  label: "Costs" },
]

const TYPE_DOT: Record<TimelineEventType, string> = {
  creation:         "bg-muted-foreground",
  status_change:    "bg-brand",
  field_update:     "bg-info",
  note:             "bg-warning",
  delay:            "bg-danger",
  photo:            "bg-success",
  quote:            "bg-brand",
  comm:             "bg-muted-foreground",
  cost_allocation:  "bg-info",
  contractor_update:"bg-brand",
  cancellation:     "bg-danger",
  reassignment:     "bg-warning",
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleDateString("en-ZA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
}

function ActorLabel({ actor }: { actor: TimelineEvent["actor"] }) {
  const label = actor.name ?? ({ agent: "Agent", tenant: "Tenant", contractor: "Contractor", system: "System" }[actor.type] ?? actor.type)
  return <span className="text-[10px] text-muted-foreground">{label}</span>
}

export function TimelineCard({ events }: Readonly<Props>) {
  const [filter, setFilter] = useState<FilterKey>("all")

  const visible = filter === "all" ? events : events.filter(e => e.type === filter)

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base font-semibold">Timeline</CardTitle>
            <span className="text-xs text-muted-foreground">({visible.length})</span>
          </div>
          <div className="flex gap-1 flex-wrap">
            {FILTERS.map(f => {
              const count = f.key === "all" ? events.length : events.filter(e => e.type === f.key).length
              if (f.key !== "all" && count === 0) return null
              return (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  className={`text-[10px] px-2 py-0.5 rounded-full transition-colors ${filter === f.key ? "bg-brand text-white" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {f.label}{count > 0 && f.key !== "all" ? ` · ${count}` : ""}
                </button>
              )
            })}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {visible.length === 0 ? (
          <p className="text-sm text-muted-foreground">No events.</p>
        ) : (
          <div className="relative">
            <div className="absolute left-[4px] top-2 bottom-2 w-px bg-border" />
            <div className="space-y-4">
              {visible.map(event => (
                <div key={event.id} className="flex gap-3 pl-1">
                  <div className={`w-2.5 h-2.5 rounded-full mt-1 shrink-0 relative z-10 ${TYPE_DOT[event.type] ?? "bg-muted-foreground"}`} />
                  <div className="flex-1 min-w-0 pb-1">
                    <p className="text-sm leading-snug">{event.summary}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-muted-foreground font-mono">{fmtDateTime(event.occurred_at)}</span>
                      <span className="text-[10px] text-muted-foreground">·</span>
                      <ActorLabel actor={event.actor} />
                      {Boolean(event.details?.notified_landlord) && (
                        <span className="text-[10px] bg-info/15 text-info px-1.5 rounded-full">landlord notified</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
