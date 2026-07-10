/**
 * app/(dashboard)/calendar/page.tsx — Operations calendar page (Portfolio/Firm tier only)
 *
 * Route:  /calendar
 * Auth:   gateway (dashboard layout); tier-gated to Portfolio/Firm
 * Data:   fetchCalendarEvents + fetchOverdueAlerts via service client; properties list
 */
import { createServiceClient } from "@/lib/supabase/server"
import { getServerOrgMembership } from "@/lib/auth/server"
import { redirect } from "next/navigation"
import { CalendarDays } from "lucide-react"
import { fetchCalendarEvents, fetchOverdueAlerts, fetchCalendarSearchEntities } from "@/lib/calendar/events"
import { CalendarClientLoader } from "./CalendarClientLoader"
import { InlineLink } from "@/components/ui/actions"
import { addCalendarDays, saTodayISO } from "@/lib/dates"

function getTier(membership: { tier?: string | null } | null): string {
  return membership?.tier ?? "owner"
}

export default async function CalendarPage() {
  const membership = await getServerOrgMembership()
  if (!membership) redirect("/login")

  const tier = getTier(membership)
  const orgId = membership.org_id

  if (tier !== "portfolio" && tier !== "firm") {
    return (
      <div className="max-w-lg space-y-4">
        <div className="flex items-center gap-3">
          <CalendarDays className="h-7 w-7 text-muted-foreground" />
          <h1 className="font-heading text-3xl">Operations Calendar</h1>
        </div>
        <div className="rounded-xl border border-border/60 bg-surface-elevated px-5 py-6 space-y-2 text-sm">
          <p className="font-medium">Portfolio or Firm tier required</p>
          <p className="text-muted-foreground">
            The Operations Calendar is available on the Portfolio and Firm plans. It gives you a unified
            view of inspections, maintenance visits, lease deadlines, legal deadlines, and move-in/out dates
            across your entire portfolio.
          </p>
          <InlineLink href="/settings/subscription" className="inline-block mt-2">Upgrade your plan</InlineLink>
        </div>
      </div>
    )
  }

  const service = await createServiceClient()

  // Date range: 2 months back, 4 months forward (generous buffer for the client view)
  const today = saTodayISO()
  const rangeStart = addCalendarDays(today, -60)
  const rangeEnd = addCalendarDays(today, 120)

  const [events, alerts, searchEntities] = await Promise.all([
    fetchCalendarEvents(service, orgId, rangeStart, rangeEnd),
    fetchOverdueAlerts(service, orgId),
    fetchCalendarSearchEntities(service, orgId),
  ])

  // The header (with its Quick-add action) lives inside CalendarClient so the add button can carry the
  // toolbar's entity selection into the prefilled add pages — see CalendarQuickAdd.
  return (
    <CalendarClientLoader
      events={events}
      alerts={alerts}
      searchEntities={searchEntities}
    />
  )
}
