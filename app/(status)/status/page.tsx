/**
 * app/(status)/status/page.tsx — Pleks system status page
 *
 * Route:  /status  (also served at status.pleks.co.za via proxy rewrite)
 * Auth:   public
 * Data:   Better Stack Uptime API — monitors + incidents + 90-day SLA history
 * Notes:  ISR at 60s. Falls back gracefully when BETTERSTACK_API_KEY is absent.
 *         Grey bars = days before monitoring began (unknown, not counted in uptime).
 *         Lives in (status) route group — NOT (public) — so it gets a minimal layout
 *         with absolute links only, preventing Next.js router from trapping
 *         visitors on status.pleks.co.za when they navigate away.
 */
import type { Metadata } from "next"
import { fetchMonitors, fetchIncidents, overallStatus } from "@/lib/observability/betterstack"
import type { Monitor, DailyUptime, BsIncident, MonitorStatus } from "@/lib/observability/betterstack"
import { StatusClock } from "./StatusClock"
import "./status.css"

export const revalidate = 60
// force-dynamic: status data changes every 60s — no value in pre-rendering at build time.
// Removing build-time BetterStack API calls saves ~24 requests (~21 per-day + 3 aggregate).
export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "System Status — Pleks",
  description: "Real-time status of the Pleks platform — monitors, incidents, and uptime.",
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function heroBarClass(v: number | null) {
  if (v === null) return "st-ubar--unknown"
  if (v >= 99)    return ""                  // green — within 99% SLA
  if (v >= 95)    return "st-ubar--incident" // orange
  return "st-ubar--outage"                   // red
}

function monitorBarClass(v: number | null) {
  if (v === null) return "st-mbar--unknown"
  if (v >= 99)    return ""                  // green — within 99% SLA
  if (v >= 95)    return "st-mbar--incident" // orange
  return "st-mbar--outage"                   // red
}

function pillClass(status: MonitorStatus) {
  const map: Record<MonitorStatus, string> = {
    up:          "st-pill--operational",
    down:        "st-pill--outage",
    maintenance: "st-pill--maintenance",
    paused:      "st-pill--paused",
    pending:     "st-pill--paused",
    validating:  "st-pill--maintenance",
  }
  return map[status] ?? "st-pill--paused"
}

function statusLabel(status: MonitorStatus) {
  const map: Record<MonitorStatus, string> = {
    up: "Operational", down: "Outage", maintenance: "Maintenance",
    paused: "Paused", pending: "Pending", validating: "Validating",
  }
  return map[status] ?? status
}

// Average uptime per day across all monitors (drives the hero uptime strip)
function computeOverallHistory(monitors: Monitor[]): { date: string; value: number | null }[] {
  const to = new Date()
  return Array.from({ length: 90 }, (_, i) => {
    const d      = new Date(to.getTime() - (89 - i) * 86_400_000)
    const date   = d.toISOString().split("T")[0]
    const values = monitors
      .map(m => m.history[i]?.availability)
      .filter((v): v is number => v != null)
    const value  = values.length === 0 ? null : values.reduce((s, v) => s + v, 0) / values.length
    return { date, value }
  })
}

function formatDuration(startedAt: string, resolvedAt: string | null): string {
  const mins = Math.round((( resolvedAt ? new Date(resolvedAt).getTime() : Date.now()) - new Date(startedAt).getTime()) / 60000)
  return mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`
}

function formatCompactDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-ZA", {
    day: "numeric", month: "short", year: "numeric",
    timeZone: "Africa/Johannesburg",
  })
}

// Split incidents for display: active (always shown) + resolved within 48h, with
// older resolved incidents behind a disclosure. Module-level so the Date.now()
// time read isn't flagged as impure in the component render body.
function splitIncidentsByAge(incidents: BsIncident[]) {
  const cutoff = Date.now() - 48 * 3_600_000
  return {
    active:         incidents.filter(i => !i.resolvedAt),
    recentResolved: incidents.filter(i => i.resolvedAt && new Date(i.startedAt).getTime() >= cutoff),
    olderResolved:  incidents.filter(i => i.resolvedAt && new Date(i.startedAt).getTime() < cutoff),
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

// Single calm brand animation — a heart whose amber/status-tinted fill rises and
// settles like a heartbeat, then empties and repeats. Echoes the welcome shield fill.
const HEART_PATH = "M18 31 C18 31 4.5 22.5 4.5 13 C4.5 8.4 8 5 12 5 C14.6 5 16.8 6.6 18 8.8 C19.2 6.6 21.4 5 24 5 C28 5 31.5 8.4 31.5 13 C31.5 22.5 18 31 18 31 Z"

function HeartPulse({ color }: Readonly<{ color: string }>) {
  return (
    <svg className="st-heart" width={52} height={52} viewBox="0 0 36 36" fill="none" aria-hidden="true">
      {/* faint track */}
      <path d={HEART_PATH} stroke="var(--ink, #1a1a18)" strokeOpacity="0.12" strokeWidth="1.5" strokeLinejoin="round" fill="none" />
      {/* completion pulse — rings outward then fades */}
      <path className="st-heart-pulse" d={HEART_PATH} stroke={color} strokeWidth="1.5" strokeLinejoin="round" fill="none" />
      {/* amber border draws around the heart perimeter */}
      <path className="st-heart-draw" d={HEART_PATH} pathLength={100} stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  )
}

function MonitorRow({ monitor }: Readonly<{ monitor: Monitor }>) {
  const showUrl = monitor.url && monitor.url !== monitor.name
  return (
    <div className="st-monitor-row">
      <div className="st-monitor-name">
        <span className="st-monitor-label">{monitor.name}</span>
        {showUrl && <span className="st-monitor-url">{monitor.url}</span>}
      </div>

      {/* 90-day bar chart */}
      <div className="st-monitor-bars">
        {monitor.history.map((d: DailyUptime) => (
          <span
            key={d.date}
            className={`st-mbar ${monitorBarClass(d.availability)}`}
            title={d.availability === null ? `No data — ${d.date}` : `${d.availability.toFixed(2)}% — ${d.date}`}
          />
        ))}
      </div>

      <div className="st-monitor-status">
        <span className="st-uptime-pct">{monitor.availability.toFixed(2)}%</span>
        <span className={`st-pill ${pillClass(monitor.status)}`}>
          <span className="st-pill-dot"/>
          {statusLabel(monitor.status)}
        </span>
      </div>
    </div>
  )
}

function IncidentCard({ incident }: Readonly<{ incident: BsIncident }>) {
  const resolved = !!incident.resolvedAt
  const title    = incident.cause || incident.name
  const monitor  = incident.cause ? incident.name : ""
  return (
    <div className="st-incident-card">
      <div className="st-incident-inner">
        <div className={`st-inc-dot ${resolved ? "st-inc-dot--resolved" : "st-inc-dot--active"}`}/>
        <div className="st-inc-title-group">
          <div className="st-inc-title">{title}</div>
          {monitor && <div className="st-inc-monitor">{monitor}</div>}
        </div>
        <div className="st-inc-meta">
          <span className={`st-inc-badge ${resolved ? "st-inc-badge--resolved" : "st-inc-badge--active"}`}>
            {resolved ? "Resolved" : "Active"}
          </span>
          <span className="st-inc-time">
            {formatCompactDate(incident.startedAt)} · {formatDuration(incident.startedAt, incident.resolvedAt)}
          </span>
        </div>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function StatusPage() {
  const [monitors, incidents] = await Promise.all([
    fetchMonitors(90),
    fetchIncidents(30, 10),
  ])

  const overall      = overallStatus(monitors)
  const overallLabel = { operational: "All systems operational", degraded: "Partial degradation", outage: "Service outage" }[overall]

  const overallHistory = computeOverallHistory(monitors)
  const knownDays      = overallHistory.filter(h => h.value !== null).length

  // Average of all monitor availabilities (each computed from their daily SLA history)
  const overallUptime  = monitors.length > 0
    ? monitors.reduce((s, m) => s + m.availability, 0) / monitors.length
    : 100

  let uptimeColor = "var(--positive,#2d7d52)"
  if (overall === "outage")   uptimeColor = "var(--critical,#b93a3a)"
  if (overall === "degraded") uptimeColor = "#c97c2a"

  // Default view: last 48 hours; older resolved incidents collapse behind a disclosure.
  const { active: activeIncidents, recentResolved, olderResolved } = splitIncidentsByAge(incidents)

  return (
    <>
      {/* ── Hero ── */}
      <div className="st-hero">
        <div className="st-hero-bg" aria-hidden="true" />
        <div className="st-hero-inner">
          <div className="st-eyebrow">System status</div>

          <div className="st-headline">
            <HeartPulse color={uptimeColor} />
            <h1>{overallLabel}</h1>
          </div>

          <div className="st-meta">
            <div className="st-meta-item">
              <span>Updated</span>
              <StatusClock />
            </div>
            <div className="st-meta-divider"/>
            <div className="st-meta-item">
              <span>Refreshes every</span>
              <strong>60s</strong>
            </div>
            <div className="st-meta-divider"/>
            <div className="st-meta-item">
              <span>{knownDays > 0 ? `${knownDays}-day` : "Current"} uptime</span>
              <strong style={{ color: uptimeColor }}>
                {overallUptime.toFixed(2)}%
              </strong>
            </div>
          </div>

          {/* 90-day uptime strip */}
          <div className="st-uptime-strip">
            {overallHistory.map(({ date, value }) => (
              <div
                key={date}
                className={`st-ubar ${heroBarClass(value)}`}
                title={value === null ? "No data" : `${value.toFixed(2)}%`}
              />
            ))}
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className="st-body">

        {/* Monitors */}
        <div className="st-monitors">
          <div className="st-section-label">Components</div>
          {monitors.length === 0 ? (
            <p style={{ fontSize: 14, color: "var(--ink-faint)", padding: "16px 0" }}>No monitor data available.</p>
          ) : (
            monitors.map(m => <MonitorRow key={m.id} monitor={m}/>)
          )}
        </div>

        {/* Incidents — last 48 hours by default; older behind a disclosure */}
        <div className="st-incidents">
          <div className="st-section-label">Incidents — last 48 hours</div>

          {activeIncidents.length === 0 && recentResolved.length === 0 ? (
            <div className="st-incident-card">
              <div className="st-incident-inner">
                <div className="st-inc-dot st-inc-dot--resolved"/>
                <div className="st-inc-title-group">
                  <div className="st-inc-title">No incidents in the last 48 hours</div>
                </div>
                <div className="st-inc-meta">
                  <span className="st-inc-badge st-inc-badge--resolved">All clear</span>
                </div>
              </div>
            </div>
          ) : (
            <>
              {activeIncidents.map(i => <IncidentCard key={i.id} incident={i}/>)}
              {recentResolved.length > 0 && (
                <>
                  {activeIncidents.length > 0 && (
                    <div className="st-resolved-header">RESOLVED</div>
                  )}
                  {recentResolved.map(i => <IncidentCard key={i.id} incident={i}/>)}
                </>
              )}
            </>
          )}

          {olderResolved.length > 0 && (
            <details className="st-incidents-more">
              <summary>
                <span className="st-more-label">
                  {olderResolved.length} earlier {olderResolved.length === 1 ? "incident" : "incidents"} (last 30 days)
                </span>
                <span className="st-more-arrow" aria-hidden="true">→</span>
              </summary>
              <div className="st-incidents-more-list">
                {olderResolved.map(i => <IncidentCard key={i.id} incident={i}/>)}
              </div>
            </details>
          )}
        </div>

        <p className="st-footer-note">
          Uptime data powered by{" "}
          <a href="https://betterstack.com" target="_blank" rel="noopener noreferrer" style={{ color: "var(--ink-mute)" }}>Better Stack</a>.
          {" "}Grey bars indicate days before monitoring began.
        </p>
      </div>
    </>
  )
}
