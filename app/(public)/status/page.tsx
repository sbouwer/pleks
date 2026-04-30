/**
 * app/(public)/status/page.tsx — Public system status page
 *
 * Route:  /status (served on pleks.co.za apex)
 * Auth:   public
 * Data:   checkHealth() + fetchBetterStackIncidents() from lib/observability/health
 * Notes:  ISR 60s — data refreshes every minute. noindex (stale snapshots in search are misleading).
 */
import type { Metadata } from "next"
import { checkHealth, fetchBetterStackIncidents, type Incident } from "@/lib/observability/health"

export const revalidate = 60

export const metadata: Metadata = {
  title: "System Status — Pleks",
  robots: { index: false, follow: false },
}

const DOT: Record<string, string> = {
  ok:       "bg-green-500",
  degraded: "bg-amber-400",
  down:     "bg-red-500",
}

const LABEL: Record<string, string> = {
  ok:       "Operational",
  degraded: "Degraded",
  down:     "Outage",
}

const HEADING: Record<string, string> = {
  ok:       "All systems operational",
  degraded: "Some systems degraded",
  down:     "Service disruption",
}

const COMPONENTS: { key: string; name: string }[] = [
  { key: "db",      name: "Database" },
  { key: "email",   name: "Email delivery" },
  { key: "storage", name: "File storage" },
  { key: "crons",   name: "Scheduled jobs" },
]

function formatTime(iso: string): string {
  const d = new Date(iso)
  // Format as HH:mm SAST (UTC+2) without locale-dependent formatting
  const utcH = d.getUTCHours()
  const utcM = d.getUTCMinutes()
  const sastH = (utcH + 2) % 24
  return `${String(sastH).padStart(2, "0")}:${String(utcM).padStart(2, "0")} SAST`
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toISOString().slice(0, 10)
}

function IncidentRow({ incident }: Readonly<{ incident: Incident }>) {
  return (
    <div className="border border-border rounded-lg p-4">
      <div className="flex items-start justify-between gap-4 mb-1">
        <p className="text-sm font-medium">{incident.title}</p>
        <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${
          incident.resolved_at
            ? "bg-green-100 text-green-700"
            : "bg-amber-100 text-amber-700"
        }`}>
          {incident.resolved_at ? "Resolved" : "Ongoing"}
        </span>
      </div>
      <p className="text-xs text-muted-foreground mb-1">{formatDate(incident.started_at)}</p>
      {incident.summary && (
        <p className="text-xs text-muted-foreground">{incident.summary}</p>
      )}
    </div>
  )
}

export default async function StatusPage() {
  const [health, incidents] = await Promise.all([
    checkHealth(),
    fetchBetterStackIncidents(),
  ])

  const components = health.components

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 py-16 space-y-10">

        {/* Header */}
        <div>
          <p className="text-xs text-muted-foreground uppercase tracking-widest mb-4">pleks.co.za</p>
          <div className="flex items-center gap-3 mb-2">
            <span className={`inline-block h-3 w-3 rounded-full ${DOT[health.status]}`} />
            <h1 className="text-xl font-semibold">{HEADING[health.status]}</h1>
          </div>
          <p className="text-xs text-muted-foreground">
            Last updated {formatTime(health.timestamp)} · refreshes every 60 seconds
          </p>
        </div>

        {/* Components */}
        <div>
          <h2 className="text-sm font-medium mb-3">Components</h2>
          <div className="border border-border rounded-lg divide-y divide-border">
            {COMPONENTS.map(({ key, name }) => {
              const c = components[key as keyof typeof components]
              return (
                <div key={key} className="flex items-center justify-between px-4 py-3">
                  <span className="text-sm">{name}</span>
                  <div className="flex items-center gap-2">
                    <span className={`inline-block h-2 w-2 rounded-full ${DOT[c.status]}`} />
                    <span className="text-xs text-muted-foreground">{LABEL[c.status]}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Incidents */}
        <div>
          <h2 className="text-sm font-medium mb-3">Recent incidents (last 7 days)</h2>
          {incidents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No incidents in the last 7 days.</p>
          ) : (
            <div className="space-y-3">
              {incidents.map(i => <IncidentRow key={i.id} incident={i} />)}
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
