/**
 * app/(public)/status/page.tsx — Pleks system status page
 *
 * Route:  /status  (also served at status.pleks.co.za via proxy rewrite)
 * Auth:   public
 * Data:   Better Stack Uptime API — monitors + incidents + 90-day SLA history
 * Notes:  ISR at 60s. Falls back gracefully when BETTERSTACK_API_KEY is absent.
 *         Grey bars = days before monitor existed (unknown, not counted).
 */
import type { Metadata } from "next"
import { fetchMonitors, fetchIncidents, overallStatus } from "@/lib/observability/betterstack"
import type { Monitor, DailyUptime, BsIncident, MonitorStatus } from "@/lib/observability/betterstack"

export const revalidate = 60

export const metadata: Metadata = {
  title: "System Status — Pleks",
  description: "Real-time status of the Pleks platform — monitors, incidents, and uptime.",
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function statusColor(status: MonitorStatus) {
  const map: Record<MonitorStatus, string> = {
    up:          "var(--green-600, #16a34a)",
    down:        "var(--red-600, #dc2626)",
    maintenance: "var(--amber-500, #f59e0b)",
    paused:      "var(--ink-faint, #9ca3af)",
    pending:     "var(--ink-faint, #9ca3af)",
    validating:  "var(--amber-500, #f59e0b)",
  }
  return map[status] ?? "var(--ink-faint)"
}

function statusLabel(status: MonitorStatus) {
  const map: Record<MonitorStatus, string> = {
    up:          "Operational",
    down:        "Outage",
    maintenance: "Maintenance",
    paused:      "Paused",
    pending:     "Pending",
    validating:  "Validating",
  }
  return map[status] ?? status
}

function barColor(availability: number | null): string {
  if (availability === null) return "#d1d5db"   // grey — unknown / no data
  if (availability >= 100)   return "#16a34a"   // green — perfect
  if (availability >= 95)    return "#f59e0b"   // amber — partial
  return "#dc2626"                               // red — significant outage
}

function formatDuration(startedAt: string, resolvedAt: string | null): string {
  const start = new Date(startedAt).getTime()
  const end   = resolvedAt ? new Date(resolvedAt).getTime() : Date.now()
  const mins  = Math.round((end - start) / 60000)
  if (mins < 60) return `${mins}m`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-ZA", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", timeZone: "Africa/Johannesburg",
  }) + " SAST"
}

// ── Components ────────────────────────────────────────────────────────────────

function UptimeBar({ day }: { day: DailyUptime }) {
  const title = day.availability !== null
    ? `${day.availability.toFixed(2)}% — ${day.date}`
    : `No data — ${day.date}`
  return (
    <span
      title={title}
      style={{
        flex: 1, minWidth: 0, height: 28,
        background: barColor(day.availability),
        borderRadius: 2, display: "block",
      }}
    />
  )
}

function MonitorRow({ monitor }: { monitor: Monitor }) {
  const knownDays = monitor.history.filter(d => d.availability !== null)
  const hasHistory = knownDays.length > 0
  const daysLabel = knownDays.length < monitor.history.length
    ? `${knownDays.length} days`
    : "90 days"

  return (
    <div style={{ padding: "16px 0", borderBottom: "1px solid var(--border, #e5e7eb)" }}>
      {/* Name + status row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: hasHistory ? 10 : 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <span style={{
            width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
            background: statusColor(monitor.status),
            boxShadow: monitor.status === "down"
              ? `0 0 0 3px color-mix(in srgb, ${statusColor(monitor.status)} 20%, transparent)`
              : "none",
          }} />
          <span style={{ fontSize: 14, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {monitor.name}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0, marginLeft: 12 }}>
          <span style={{ fontSize: 12, color: "var(--ink-mute, #6b7280)", fontFamily: "var(--pub-mono, monospace)" }}>
            {monitor.availability.toFixed(2)}%
          </span>
          <span style={{ fontSize: 12, fontWeight: 600, color: statusColor(monitor.status) }}>
            {statusLabel(monitor.status)}
          </span>
        </div>
      </div>

      {/* 90-day uptime bar chart */}
      {monitor.history.length > 0 && (
        <>
          <div style={{ display: "flex", gap: 1.5 }}>
            {monitor.history.map(d => <UptimeBar key={d.date} day={d} />)}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
            <span style={{ fontSize: 11, color: "var(--ink-faint, #9ca3af)" }}>90 days ago</span>
            <span style={{ fontSize: 11, color: "var(--ink-faint, #9ca3af)" }}>{daysLabel} of data · Today</span>
          </div>
        </>
      )}
    </div>
  )
}

function IncidentCard({ incident }: { incident: BsIncident }) {
  const resolved = !!incident.resolvedAt
  return (
    <div style={{
      border: "1px solid var(--border, #e5e7eb)",
      borderRadius: 8,
      padding: "14px 16px",
      marginBottom: 10,
      borderLeft: `3px solid ${resolved ? "var(--green-600, #16a34a)" : "var(--red-600, #dc2626)"}`,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 4 }}>
        <span style={{ fontWeight: 600, fontSize: 13 }}>{incident.name}</span>
        <span style={{
          fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 99, flexShrink: 0,
          background: resolved ? "color-mix(in srgb, #16a34a 12%, transparent)" : "color-mix(in srgb, #dc2626 12%, transparent)",
          color: resolved ? "#15803d" : "#b91c1c",
          whiteSpace: "nowrap",
        }}>
          {resolved ? "Resolved" : "Active"}
        </span>
      </div>
      {incident.cause && (
        <p style={{ fontSize: 12, color: "var(--ink-mute, #6b7280)", margin: "0 0 6px" }}>{incident.cause}</p>
      )}
      <div style={{ fontSize: 11, color: "var(--ink-faint, #9ca3af)", display: "flex", gap: 12, flexWrap: "wrap" }}>
        <span>Started: {formatDate(incident.startedAt)}</span>
        {incident.resolvedAt && <span>Resolved: {formatDate(incident.resolvedAt)}</span>}
        <span>Duration: {formatDuration(incident.startedAt, incident.resolvedAt)}</span>
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

  const overall = overallStatus(monitors)
  const now     = new Date()

  const overallColor = { operational: "#16a34a", degraded: "#f59e0b", outage: "#dc2626" }[overall]
  const overallLabel = { operational: "All systems operational", degraded: "Partial degradation", outage: "Service outage" }[overall]

  return (
    <div className="pub-wrap" style={{ paddingTop: 64, paddingBottom: 96, maxWidth: 760 }}>

      {/* Header */}
      <div style={{ marginBottom: 48 }}>
        <p style={{ fontSize: 12, color: "var(--ink-faint)", fontFamily: "var(--pub-mono)", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 12 }}>
          PLEKS · SYSTEM STATUS
        </p>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <span style={{
            width: 14, height: 14, borderRadius: "50%", background: overallColor, flexShrink: 0,
            boxShadow: `0 0 0 4px color-mix(in srgb, ${overallColor} 18%, transparent)`,
          }} />
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0 }}>{overallLabel}</h1>
        </div>
        <p style={{ fontSize: 13, color: "var(--ink-mute)", margin: 0 }}>
          Last updated {now.toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg", hour: "2-digit", minute: "2-digit" })} SAST
          {" · "}refreshes every 60 seconds
        </p>
      </div>

      {/* Monitors */}
      <section style={{ marginBottom: 48 }}>
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-faint)", marginBottom: 4 }}>
          Components
        </p>
        <div style={{ borderTop: "1px solid var(--border, #e5e7eb)" }}>
          {monitors.length === 0 ? (
            <p style={{ fontSize: 14, color: "var(--ink-mute)", padding: "16px 0" }}>No monitor data available.</p>
          ) : (
            monitors.map(m => <MonitorRow key={m.id} monitor={m} />)
          )}
        </div>
      </section>

      {/* Incidents */}
      <section>
        <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ink-faint)", marginBottom: 16 }}>
          Incidents — last 30 days
        </p>
        {incidents.length === 0 ? (
          <div style={{
            padding: "24px 20px", border: "1px solid var(--border, #e5e7eb)",
            borderRadius: 8, textAlign: "center", borderLeft: "3px solid #16a34a",
          }}>
            <p style={{ fontSize: 14, color: "var(--ink-mute)", margin: 0 }}>No incidents in the last 30 days.</p>
          </div>
        ) : (
          incidents.map(i => <IncidentCard key={i.id} incident={i} />)
        )}
      </section>

      {/* Footer */}
      <p style={{ marginTop: 48, fontSize: 12, color: "var(--ink-faint)", borderTop: "1px solid var(--border)", paddingTop: 24 }}>
        Uptime data powered by{" "}
        <a href="https://betterstack.com" target="_blank" rel="noopener noreferrer" style={{ color: "var(--ink-mute)" }}>Better Stack</a>.
        {" "}Refreshes every 60 seconds. Grey bars indicate days before monitoring began.
      </p>

    </div>
  )
}
