"use client"

/**
 * components/layout/MobileScheduleSheet.tsx — the agent's upcoming agenda (Schedule tab)
 *
 * Auth:   dashboard layout (gateway)
 * Data:   useUpcomingSchedule (inspections, next 30 days) — all-tier, RLS-scoped
 * Notes:  Tall bottom sheet grouped by day (Today / Tomorrow / weekday date). Tapping a stop navigates
 *         to the inspection and closes. Unlike /calendar (paid Operations Calendar), this is all-tier.
 */

import { useRouter } from "next/navigation"
import { ChevronRight, CalendarClock } from "lucide-react"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useUpcomingSchedule } from "@/hooks/useUpcomingSchedule"
import { type ScheduleStop } from "@/hooks/useTodaySchedule"
import { fmtZA } from "@/lib/dates"

interface MobileScheduleSheetProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
}

interface DayGroup {
  key: string
  label: string
  stops: ScheduleStop[]
}

function dayLabel(d: Date, today: Date): string {
  const diffDays = Math.round((d.getTime() - today.getTime()) / 86_400_000)
  if (diffDays === 0) return "Today"
  if (diffDays === 1) return "Tomorrow"
  return fmtZA(d, { weekday: "long", day: "numeric", month: "short" })
}

function groupByDay(stops: ScheduleStop[]): DayGroup[] {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const groups: DayGroup[] = []
  const index = new Map<string, DayGroup>()

  for (const stop of stops) {
    if (!stop.scheduledAt) continue
    const d = new Date(stop.scheduledAt)
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
    let group = index.get(key)
    if (!group) {
      group = { key, label: dayLabel(new Date(d.getFullYear(), d.getMonth(), d.getDate()), todayStart), stops: [] }
      index.set(key, group)
      groups.push(group)
    }
    group.stops.push(stop)
  }
  return groups
}

export function MobileScheduleSheet({ open, onOpenChange }: MobileScheduleSheetProps) {
  const router = useRouter()
  const { stops, isLoading } = useUpcomingSchedule(30)
  const groups = groupByDay(stops)

  function go(href: string) {
    onOpenChange(false)
    router.push(href)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" showCloseButton={false} className="rounded-t-2xl max-h-[88vh] h-[88vh] p-0">
        <SheetHeader className="px-4 pt-4 pb-3 border-b border-border">
          <SheetTitle className="text-base font-semibold">Schedule</SheetTitle>
          <p className="text-xs text-muted-foreground">Your inspections over the next 30 days.</p>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto pb-6">
          {groups.length === 0 ? (
            <div className="px-4 py-16 text-center">
              <CalendarClock className="mx-auto h-8 w-8 text-muted-foreground/50" />
              <p className="mt-3 text-sm text-muted-foreground">
                {isLoading ? "Loading…" : "Nothing scheduled in the next 30 days."}
              </p>
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.key}>
                <p className="sticky top-0 z-10 bg-muted/40 backdrop-blur-sm px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70 border-b border-border/50">
                  {group.label}
                </p>
                {group.stops.map((stop) => (
                  <button
                    key={stop.id}
                    type="button"
                    onClick={() => go(stop.href)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left border-b border-border/50 active:bg-muted transition-colors"
                  >
                    <div className="w-12 flex-shrink-0">
                      <span className="text-sm font-bold tabular-nums text-brand">{stop.time}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{stop.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{stop.location}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
