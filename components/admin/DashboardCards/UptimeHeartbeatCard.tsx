/**
 * components/admin/DashboardCards/UptimeHeartbeatCard.tsx — Cron heartbeat health with 7-day history
 *
 * Auth:   Server component — rendered inside admin dashboard (behind requireAdminAuth)
 * Data:   cron_runs — last 7 days, all jobs
 * Notes:  Health rule from ADDENDUM_00G D-UP-08: amber >25h, red >48h or last=failed.
 *         7-day sparkline squares show per-day pass/fail/miss status.
 */
import { createServiceClient } from "@/lib/supabase/server"
import { addCalendarDays, saDateISO } from "@/lib/dates"

const DAILY_JOBS = [
  "daily",
  "invoice-generate",
  "trial-expiry",
  "billing-cascade",
  "arrears-sequence",
  "cost-snapshots",
  "insurance-renewals",
  "expire-info-requests",
  "process-audit-exports",
  "lease-expiry-check",
]

type Health = "ok" | "stale" | "critical" | "never" | "running"
type DayStatus = "ok" | "failed" | "missing"

interface JobRow {
  job_name: string
  status: string
  started_at: string
  finished_at: string | null
}

function buildLastSevenDays(nowMs: number): string[] {
  const days: string[] = []
  for (let i = 6; i >= 0; i--) {
    days.push(addCalendarDays(saDateISO(new Date(nowMs)), -i))
  }
  return days
}

async function fetchRecentRuns(): Promise<{ data: JobRow[] | null; error: { message: string } | null; nowMs: number }> {
  const db = await createServiceClient()
  const cutoff = new Date(Date.now() - 7 * 24 * 3_600_000).toISOString()
  const result = await db
    .from("cron_runs")
    .select("job_name, status, started_at, finished_at")
    .gte("started_at", cutoff)
    .order("started_at", { ascending: false })
    .limit(500)
  const nowMs = Date.now()
  return {
    data:  result.data as JobRow[] | null,
    error: result.error ? { message: result.error.message } : null,
    nowMs,
  }
}

function classify(
  row: { status: string; started_at: string; finished_at: string | null } | null,
  nowMs: number,
): { health: Health; age_h: number | null; duration_s: number | null } {
  if (!row) return { health: "never", age_h: null, duration_s: null }
  const age_h = (nowMs - new Date(row.started_at).getTime()) / 3_600_000
  const duration_s = row.finished_at
    ? (new Date(row.finished_at).getTime() - new Date(row.started_at).getTime()) / 1000
    : null
  if (row.status === "running") return { health: "running", age_h, duration_s }
  if (row.status === "failed")  return { health: "critical", age_h, duration_s }
  if (age_h > 48) return { health: "critical", age_h, duration_s }
  if (age_h > 25) return { health: "stale",    age_h, duration_s }
  return { health: "ok", age_h, duration_s }
}

const HEALTH_STYLES: Record<Health, { dot: string; label: string; labelColor: string }> = {
  ok:       { dot: "var(--positive)",  label: "ok",      labelColor: "var(--positive)" },
  stale:    { dot: "var(--caution)",   label: "stale",   labelColor: "var(--caution)" },
  critical: { dot: "var(--critical)",  label: "critical", labelColor: "var(--critical)" },
  never:    { dot: "var(--ink-faint)", label: "never",   labelColor: "var(--ink-faint)" },
  running:  { dot: "var(--amber)",     label: "running", labelColor: "var(--amber)" },
}

const DAY_COLORS: Record<DayStatus, string> = {
  ok:      "var(--positive)",
  failed:  "var(--critical)",
  missing: "var(--rule-strong)",
}

function fmtAge(h: number | null): string {
  if (h === null) return "—"
  if (h < 1)  return `${Math.round(h * 60)}m`
  if (h < 24) return `${Math.round(h)}h`
  return `${Math.round(h / 24)}d`
}

function fmtDuration(s: number | null): string {
  if (s === null) return ""
  if (s < 60) return `${Math.round(s)}s`
  return `${Math.round(s / 60)}m`
}

function utcDayKey(iso: string): string {
  return iso.slice(0, 10)
}

export async function UptimeHeartbeatCard() {
  const { data, error, nowMs } = await fetchRecentRuns()
  if (error) console.error("[UptimeHeartbeatCard] query failed:", error.message)

  const rows = data ?? []

  // Build map: job_name → latest run row
  const latestByJob = new Map<string, JobRow>()
  // Build map: job_name → Map<date string, DayStatus>
  const historyByJob = new Map<string, Map<string, DayStatus>>()

  for (const row of rows) {
    if (!latestByJob.has(row.job_name)) latestByJob.set(row.job_name, row)

    const hist = historyByJob.get(row.job_name) ?? new Map<string, DayStatus>()
    const day  = utcDayKey(row.started_at)
    // Keep worst status per day (failed beats ok)
    const existing = hist.get(day)
    if (!existing || (row.status === "failed" && existing !== "failed")) {
      hist.set(day, row.status === "failed" ? "failed" : "ok")
    }
    historyByJob.set(row.job_name, hist)
  }

  const days = buildLastSevenDays(nowMs)

  const extraJobs = [...latestByJob.keys()].filter((j) => !DAILY_JOBS.includes(j))
  const allJobs   = [...DAILY_JOBS, ...extraJobs]

  const criticalCount = allJobs.filter((name) => {
    const { health } = classify(latestByJob.get(name) ?? null, nowMs)
    return health === "critical"
  }).length

  const staleCount = allJobs.filter((name) => {
    const { health } = classify(latestByJob.get(name) ?? null, nowMs)
    return health === "stale"
  }).length

  return (
    <div style={{
      background: "var(--paper-raised)",
      border: criticalCount > 0 ? "1px solid oklch(0.55 0.18 25 / 0.4)" : "1px solid var(--rule)",
      borderRadius: "var(--r-md)",
      gridColumn: "span 8",
    }}>
      {/* Header */}
      <div style={{
        padding: "14px 18px 12px",
        borderBottom: "1px solid var(--rule)",
        display: "flex",
        alignItems: "baseline",
        justifyContent: "space-between",
      }}>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: "var(--ink)", letterSpacing: "-0.005em" }}>
          Cron heartbeats
        </span>
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          {criticalCount > 0 && (
            <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--critical)", fontWeight: 600 }}>
              {criticalCount} critical
            </span>
          )}
          {staleCount > 0 && (
            <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--caution)" }}>
              {staleCount} stale
            </span>
          )}
          {criticalCount === 0 && staleCount === 0 && (
            <span style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--positive)" }}>
              All healthy
            </span>
          )}
          {/* Day headers */}
          <div style={{ display: "flex", gap: 3, marginLeft: 8 }}>
            {days.map((d) => (
              <span key={d} style={{
                fontFamily: "var(--mono)",
                fontSize: 9,
                color: "var(--ink-faint)",
                width: 14,
                textAlign: "center",
                display: "block",
              }}>
                {new Date(d + "T12:00:00Z").toLocaleDateString("en", { weekday: "narrow" })}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Job rows */}
      <div>
        {allJobs.map((name) => {
          const row = latestByJob.get(name) ?? null
          const { health, age_h, duration_s } = classify(row, nowMs)
          const hs   = HEALTH_STYLES[health]
          const hist = historyByJob.get(name)

          return (
            <div key={name} style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "8px 16px",
              borderBottom: "1px solid var(--rule)",
              borderLeft: health === "critical" ? "3px solid var(--critical)" : "3px solid transparent",
            }}>
              {/* Status dot */}
              <span style={{
                width: 7,
                height: 7,
                borderRadius: "50%",
                flexShrink: 0,
                background: hs.dot,
              }} />

              {/* Job name */}
              <span style={{
                fontFamily: "var(--mono)",
                fontSize: 11.5,
                color: "var(--ink)",
                flex: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}>
                {name}
              </span>

              {/* Duration */}
              <span style={{
                fontFamily: "var(--mono)",
                fontSize: 10,
                color: "var(--ink-faint)",
                minWidth: 28,
                textAlign: "right",
              }}>
                {fmtDuration(duration_s)}
              </span>

              {/* Last run age */}
              <span style={{
                fontFamily: "var(--mono)",
                fontSize: 11,
                color: hs.labelColor,
                minWidth: 36,
                textAlign: "right",
                whiteSpace: "nowrap",
              }}>
                {age_h === null ? "never" : fmtAge(age_h) + " ago"}
              </span>

              {/* 7-day sparkline squares */}
              <div style={{ display: "flex", gap: 3, marginLeft: 8 }}>
                {days.map((day) => {
                  const status: DayStatus = hist?.get(day) ?? "missing"
                  return (
                    <span
                      key={day}
                      title={`${day}: ${status}`}
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: 3,
                        display: "block",
                        flexShrink: 0,
                        background: DAY_COLORS[status],
                        opacity: status === "missing" ? 0.4 : 1,
                      }}
                    />
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
