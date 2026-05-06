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
function computeOverallHistory(monitors: Monitor[]): (number | null)[] {
  return Array.from({ length: 90 }, (_, i) => {
    const values = monitors
      .map(m => m.history[i]?.availability)
      .filter((v): v is number => v != null)
    if (values.length === 0) return null
    return values.reduce((s, v) => s + v, 0) / values.length
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

// ── Sub-components ────────────────────────────────────────────────────────────

function HeroSvg() {
  const ekgPoints = "0,200 120,200 160,200 180,140 196,220 210,60 224,220 238,160 260,200 400,200 440,200 460,155 472,210 482,80 494,210 504,168 520,200 660,200 700,200 720,160 732,210 742,95 754,210 764,170 780,200 920,200 960,200 980,152 992,212 1004,82 1016,212 1026,166 1040,200 1200,200 1240,200 1260,158 1272,212 1282,88 1294,212 1304,168 1320,200 1440,200"
  return (
    <svg className="st-hero-svg" viewBox="0 0 1440 260" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <pattern id="st-grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1a1a18" strokeWidth="0.4" opacity="0.06"/>
        </pattern>
        <linearGradient id="st-sweepGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="#c9832a" stopOpacity="0"/>
          <stop offset="40%"  stopColor="#c9832a" stopOpacity="0"/>
          <stop offset="60%"  stopColor="#c9832a" stopOpacity="0.55"/>
          <stop offset="75%"  stopColor="#c9832a" stopOpacity="0.9"/>
          <stop offset="85%"  stopColor="#c9832a" stopOpacity="0.4"/>
          <stop offset="100%" stopColor="#c9832a" stopOpacity="0"/>
        </linearGradient>
        <mask id="st-sweep">
          <rect x="-1440" y="0" width="1440" height="260" fill="url(#st-sweepGrad)">
            <animate attributeName="x" from="-1440" to="1440" dur="4s" repeatCount="indefinite"/>
          </rect>
        </mask>
      </defs>

      <rect width="1440" height="260" fill="url(#st-grid)"/>

      {/* EKG baseline — dim */}
      <polyline points={ekgPoints} fill="none" stroke="#c9832a" strokeWidth="1.5" opacity="0.22" strokeLinejoin="round" strokeLinecap="round"/>
      {/* EKG with amber sweep */}
      <polyline points={ekgPoints} fill="none" stroke="#c9832a" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" mask="url(#st-sweep)"/>

      {/* Network nodes */}
      <circle cx="180" cy="60" r="4" fill="#c9832a" opacity="0.5"/>
      <circle cx="180" cy="60" r="10" fill="none" stroke="#c9832a" strokeWidth="1" opacity="0.18"/>
      <line x1="180" y1="60" x2="240" y2="90" stroke="#1a1a18" strokeWidth="0.75" opacity="0.08"/>
      <line x1="180" y1="60" x2="150" y2="95" stroke="#1a1a18" strokeWidth="0.75" opacity="0.08"/>
      <circle cx="240" cy="90" r="3" fill="#1a1a18" opacity="0.12"/>
      <circle cx="150" cy="95" r="2" fill="#1a1a18" opacity="0.12"/>

      <circle cx="742" cy="95" r="4" fill="#c9832a" opacity="0.5"/>
      <circle cx="742" cy="95" r="10" fill="none" stroke="#c9832a" strokeWidth="1" opacity="0.18"/>
      <line x1="742" y1="95" x2="790" y2="75" stroke="#1a1a18" strokeWidth="0.75" opacity="0.08"/>
      <line x1="742" y1="95" x2="700" y2="75" stroke="#1a1a18" strokeWidth="0.75" opacity="0.08"/>
      <circle cx="790" cy="75" r="3" fill="#1a1a18" opacity="0.12"/>
      <circle cx="700" cy="75" r="2.5" fill="#1a1a18" opacity="0.12"/>

      <circle cx="1282" cy="88" r="4" fill="#c9832a" opacity="0.5"/>
      <circle cx="1282" cy="88" r="10" fill="none" stroke="#c9832a" strokeWidth="1" opacity="0.18"/>
      <line x1="1282" y1="88" x2="1340" y2="70" stroke="#1a1a18" strokeWidth="0.75" opacity="0.08"/>
      <line x1="1282" y1="88" x2="1230" y2="72" stroke="#1a1a18" strokeWidth="0.75" opacity="0.08"/>
      <circle cx="1340" cy="70" r="3" fill="#1a1a18" opacity="0.12"/>
      <circle cx="1230" cy="72" r="2.5" fill="#1a1a18" opacity="0.12"/>

      <line x1="180" y1="60" x2="742" y2="95" stroke="#1a1a18" strokeWidth="0.5" strokeDasharray="6 4" opacity="0.05"/>
      <line x1="742" y1="95" x2="1282" y2="88" stroke="#1a1a18" strokeWidth="0.5" strokeDasharray="6 4" opacity="0.05"/>

      {/* Decorative bar chart */}
      <g opacity="0.1" transform="translate(1060, 80)">
        <rect x="0"  y="60"  width="6" height="60"  fill="#2d7d52" rx="1"/>
        <rect x="10" y="50"  width="6" height="70"  fill="#2d7d52" rx="1"/>
        <rect x="20" y="55"  width="6" height="65"  fill="#2d7d52" rx="1"/>
        <rect x="30" y="20"  width="6" height="100" fill="#2d7d52" rx="1"/>
        <rect x="40" y="40"  width="6" height="80"  fill="#2d7d52" rx="1"/>
        <rect x="50" y="55"  width="6" height="65"  fill="#2d7d52" rx="1"/>
        <rect x="60" y="10"  width="6" height="110" fill="#c9832a" rx="1"/>
        <rect x="70" y="50"  width="6" height="70"  fill="#2d7d52" rx="1"/>
        <rect x="80" y="45"  width="6" height="75"  fill="#2d7d52" rx="1"/>
        <rect x="90" y="55"  width="6" height="65"  fill="#2d7d52" rx="1"/>
      </g>

      {/* Response time curve */}
      <path d="M 0,80 C 100,72 200,68 300,74 C 400,80 450,62 550,58 C 650,54 700,70 800,68 C 900,66 950,58 1050,62 C 1150,66 1250,60 1440,64" fill="none" stroke="#1a1a18" strokeWidth="1" opacity="0.05" strokeDasharray="4 3"/>

      {/* Scan line */}
      <line x1="0" y1="0" x2="0" y2="260" stroke="#c9832a" strokeWidth="1" opacity="0.12">
        <animate attributeName="x1" from="0" to="1440" dur="8s" repeatCount="indefinite"/>
        <animate attributeName="x2" from="0" to="1440" dur="8s" repeatCount="indefinite"/>
      </line>
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
            title={d.availability !== null ? `${d.availability.toFixed(2)}% — ${d.date}` : `No data — ${d.date}`}
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
  const dotClass     = overall === "operational" ? "st-dot" : `st-dot ${overall}`

  const overallHistory = computeOverallHistory(monitors)
  console.log('Sample bars:', {
    day0:  overallHistory[0],
    day80: overallHistory[80],
    day88: overallHistory[88],
    day89: overallHistory[89],
  })
  console.log('Monitor 0 history sample:', {
    day0:  monitors[0]?.history[0],
    day88: monitors[0]?.history[88],
  })
  const knownDays      = overallHistory.filter(v => v !== null).length

  // Average of all monitor availabilities (each computed from their daily SLA history)
  const overallUptime  = monitors.length > 0
    ? monitors.reduce((s, m) => s + m.availability, 0) / monitors.length
    : 100

  let uptimeColor = "var(--positive,#2d7d52)"
  if (overall === "outage")   uptimeColor = "var(--critical,#b93a3a)"
  if (overall === "degraded") uptimeColor = "#c97c2a"

  const activeIncidents   = incidents.filter(i => !i.resolvedAt)
  const resolvedIncidents = incidents.filter(i => i.resolvedAt)

  return (
    <>
      {/* ── Hero ── */}
      <div className="st-hero">
        <HeroSvg />
        <div className="st-hero-inner">
          <div className="st-eyebrow">System status</div>

          <div className="st-headline">
            <div className={dotClass}/>
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
            {overallHistory.map((v, i) => (
              <div
                key={i}
                className={`st-ubar ${heroBarClass(v)}`}
                title={v !== null ? `${v.toFixed(2)}%` : "No data"}
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

        {/* Incidents */}
        <div className="st-incidents">
          <div className="st-section-label">Incidents — last 30 days</div>

          {incidents.length === 0 ? (
            <div className="st-incident-card">
              <div className="st-incident-inner">
                <div className="st-inc-dot st-inc-dot--resolved"/>
                <div className="st-inc-title-group">
                  <div className="st-inc-title">No incidents in the last 30 days</div>
                </div>
                <div className="st-inc-meta">
                  <span className="st-inc-badge st-inc-badge--resolved">All clear</span>
                </div>
              </div>
            </div>
          ) : (
            <>
              {activeIncidents.map(i => <IncidentCard key={i.id} incident={i}/>)}
              {resolvedIncidents.length > 0 && (
                <>
                  {activeIncidents.length > 0 && (
                    <div className="st-resolved-header">RESOLVED</div>
                  )}
                  {resolvedIncidents.map(i => <IncidentCard key={i.id} incident={i}/>)}
                </>
              )}
            </>
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
