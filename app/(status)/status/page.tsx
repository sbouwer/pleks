/**
 * app/(status)/status/page.tsx — Pleks system status page
 *
 * Route:  /status  (also served at status.pleks.co.za via proxy rewrite)
 * Auth:   public
 * Data:   Better Stack Uptime API — monitors + incidents + 90-day SLA history
 * Notes:  ISR at 60s. fetchMonitors/fetchIncidents never throw (return [] on missing key
 *         or network failure), so this server component degrades to empty states rather
 *         than the error boundary. Design ported from the CD status-page mockup; the
 *         interactive hero (beating heart + live ECG strip) lives in StatusView (client).
 */
import type { Metadata } from "next"
import { fetchMonitors, fetchIncidents, overallStatus } from "@/lib/observability/betterstack"
import type { Monitor, BsIncident, MonitorStatus } from "@/lib/observability/betterstack"
import { StatusView, type StatusComponent, type StatusIncident } from "./StatusView"
import "./status.css"

export const revalidate = 60
export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "System Status — Pleks",
  description: "Real-time status of the Pleks platform — monitors, incidents, and uptime.",
}

// Status colour drives the heart, the ECG sweep glow and the uptime figure.
const ACCENT = {
  operational: "oklch(0.52 0.12 150)",  // positive green
  degraded:    "oklch(0.70 0.15 68)",   // amber
  outage:      "oklch(0.52 0.18 25)",   // critical red
}
// A calm resting pulse when healthy; elevated when the system is unwell.
const BPM = { operational: 62, degraded: 78, outage: 92 }

function tickFor(v: number | null): StatusComponent["ticks"][number] {
  if (v === null) return "none"
  if (v >= 99)    return "ok"
  if (v >= 95)    return "warn"
  return "down"
}

function pillClassFor(status: MonitorStatus): string {
  if (status === "up") return "sp-pill--ok"
  if (status === "down") return "sp-pill--down"
  return "sp-pill--muted"
}

function statusLabelFor(status: MonitorStatus): string {
  const map: Record<MonitorStatus, string> = {
    up: "Operational", down: "Outage", maintenance: "Maintenance",
    paused: "Paused", pending: "Pending", validating: "Validating",
  }
  return map[status] ?? status
}

function toComponent(m: Monitor): StatusComponent {
  return {
    id: m.id,
    name: m.name,
    host: m.url && m.url !== m.name ? m.url : "",
    uptime: `${m.availability.toFixed(2)}%`,
    statusLabel: statusLabelFor(m.status),
    pillClass: pillClassFor(m.status),
    ticks: m.history.map(d => tickFor(d.availability)),
  }
}

function formatDuration(startedAt: string, resolvedAt: string | null): string {
  const mins = Math.round(((resolvedAt ? new Date(resolvedAt).getTime() : Date.now()) - new Date(startedAt).getTime()) / 60000)
  return mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`
}

function formatCompactDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-ZA", {
    day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Johannesburg",
  })
}

function toIncident(i: BsIncident): StatusIncident {
  return {
    id: i.id,
    title: i.cause || i.name,
    host: i.cause ? i.name : "",
    date: formatCompactDate(i.startedAt),
    dur: formatDuration(i.startedAt, i.resolvedAt),
    resolved: !!i.resolvedAt,
  }
}

// Module-level so the Date.now() read isn't flagged impure in the component render body.
// Active (unresolved) always shown; resolved split at 48h with older behind a disclosure.
function splitIncidents(incidents: BsIncident[]) {
  const cutoff = Date.now() - 48 * 3_600_000
  return {
    active: incidents.filter(i => !i.resolvedAt).map(toIncident),
    recent: incidents.filter(i => i.resolvedAt && new Date(i.startedAt).getTime() >= cutoff).map(toIncident),
    older:  incidents.filter(i => i.resolvedAt && new Date(i.startedAt).getTime() < cutoff).map(toIncident),
  }
}

export default async function StatusPage() {
  const [monitors, incidents] = await Promise.all([fetchMonitors(90), fetchIncidents(30, 10)])

  const overall = overallStatus(monitors)
  const overallLabel = { operational: "All systems operational", degraded: "Partial degradation", outage: "Service outage" }[overall]
  const accent = ACCENT[overall]
  const bpm = BPM[overall]

  const overallUptime = monitors.length > 0
    ? monitors.reduce((s, m) => s + m.availability, 0) / monitors.length
    : 100
  const knownDays = monitors.length > 0
    ? Math.max(...monitors.map(m => m.history.filter(d => d.availability !== null).length))
    : 0

  const { active, recent, older } = splitIncidents(incidents)

  return (
    <StatusView
      overallLabel={overallLabel}
      accent={accent}
      bpm={bpm}
      uptimePct={overallUptime.toFixed(2)}
      knownDays={knownDays}
      components={monitors.map(toComponent)}
      activeIncidents={active}
      recentResolved={recent}
      olderResolved={older}
    />
  )
}
