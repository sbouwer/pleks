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
import { ResourcePageHeader } from "@/components/ui/resource-page-header"

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
  // eslint-disable-next-line react-hooks/purity
  const rangeStart = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
  // eslint-disable-next-line react-hooks/purity
  const rangeEnd = new Date(Date.now() + 120 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]

  const [events, alerts, searchEntities] = await Promise.all([
    fetchCalendarEvents(service, orgId, rangeStart, rangeEnd),
    fetchOverdueAlerts(service, orgId),
    fetchCalendarSearchEntities(service, orgId),
  ])

  return (
    <div className="flex h-full min-h-0 flex-col gap-6">
      <ResourcePageHeader
        eyebrow="Operations"
        title="Calendar"
        headline="Your schedule"
        sub="Inspections, lease deadlines, legal dates and move-ins across your portfolio."
      />

      <CalendarClientLoader
        events={events}
        alerts={alerts}
        searchEntities={searchEntities}
        isFirm={tier === "firm"}
      />
    </div>
  )
}
