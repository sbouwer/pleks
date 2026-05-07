"use client"

/**
 * app/(dashboard)/calendar/CalendarClientLoader.tsx — Client wrapper for FullCalendar dynamic import
 *
 * Notes:  ssr: false is required because FullCalendar uses browser-only APIs.
 *         Next.js 16 disallows ssr: false inside Server Components, so this thin
 *         client wrapper owns the dynamic() call and page.tsx imports this instead.
 */
import dynamic from "next/dynamic"
import type { CalendarEvent } from "@/lib/calendar/events"

const CalendarClient = dynamic(
  () => import("./CalendarClient").then(m => ({ default: m.CalendarClient })),
  { ssr: false },
)

interface Props {
  events: CalendarEvent[]
  properties: { id: string; name: string }[]
  isFirm: boolean
}

export function CalendarClientLoader({ events, properties, isFirm }: Readonly<Props>) {
  return <CalendarClient events={events} properties={properties} isFirm={isFirm} />
}
