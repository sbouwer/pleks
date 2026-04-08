import { createServiceClient } from "@/lib/supabase/server"
import { getServerOrgMembership } from "@/lib/auth/server"
import { redirect } from "next/navigation"
import { CalendarDays } from "lucide-react"
import { fetchCalendarEvents, fetchOverdueAlerts } from "@/lib/calendar/events"
import { DeadlineAlert } from "@/components/calendar/DeadlineAlert"
import { CalendarClient } from "./CalendarClient"

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
          <a href="/settings/billing" className="inline-block mt-2 text-brand hover:underline text-sm">
            Upgrade your plan →
          </a>
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

  const [events, alerts, propertiesResult] = await Promise.all([
    fetchCalendarEvents(service, orgId, rangeStart, rangeEnd),
    fetchOverdueAlerts(service, orgId),
    service
      .from("properties")
      .select("id, name")
      .eq("org_id", orgId)
      .is("deleted_at", null)
      .order("name"),
  ])

  const properties = propertiesResult.data ?? []

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <CalendarDays className="h-7 w-7 text-muted-foreground" />
        <h1 className="font-heading text-3xl">Operations Calendar</h1>
      </div>

      <DeadlineAlert alerts={alerts} />

      <CalendarClient
        events={events}
        properties={properties}
        isFirm={tier === "firm"}
      />
    </div>
  )
}
