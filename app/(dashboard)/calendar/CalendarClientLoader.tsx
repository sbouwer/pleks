"use client"

/**
 * app/(dashboard)/calendar/CalendarClientLoader.tsx — Client wrapper for FullCalendar dynamic import
 *
 * Notes:  ssr: false is required because FullCalendar uses browser-only APIs.
 *         Next.js 16 disallows ssr: false inside Server Components, so this thin
 *         client wrapper owns the dynamic() call and page.tsx imports this instead.
 */
import dynamic from "next/dynamic"
import type { CalendarEvent, CalendarSearchEntity } from "@/lib/calendar/events"

const CalendarClient = dynamic(
  () => import("./CalendarClient").then(m => ({ default: m.CalendarClient })),
  { ssr: false },
)

interface Props {
  events: CalendarEvent[]
  alerts: CalendarEvent[]
  searchEntities: CalendarSearchEntity[]
  isFirm: boolean
}

export function CalendarClientLoader({ events, alerts, searchEntities, isFirm }: Readonly<Props>) {
  return <CalendarClient events={events} alerts={alerts} searchEntities={searchEntities} isFirm={isFirm} />
}
