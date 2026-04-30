/**
 * components/admin/DashboardCards/UptimeHeartbeatCard.tsx — Cron heartbeat health grid
 *
 * Auth:   Server component — rendered inside admin dashboard (behind requireAdminAuth)
 * Data:   cron_runs table — last run of each known job, most recent 500 rows
 * Notes:  Health rule from ADDENDUM_00G D-UP-08: amber > 25h, red > 48h or last=failed.
 *         Jobs that have never run show as "never" (grey).
 */
import { createServiceClient } from "@/lib/supabase/server"

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
  "deposit-interest",
  "owner-statement-gen",
]

type Health = "ok" | "stale" | "critical" | "never" | "running"

interface JobHealth {
  job_name: string
  status: string | null
  started_at: string | null
  finished_at: string | null
  duration_s: number | null
  health: Health
  age_h: number | null
}

function classify(job: { status: string; started_at: string; finished_at: string | null } | null): { health: Health; age_h: number | null } {
  if (!job) return { health: "never", age_h: null }
  const age_h = (Date.now() - new Date(job.started_at).getTime()) / 3_600_000
  if (job.status === "running") return { health: "running", age_h }
  if (job.status === "failed")  return { health: "critical", age_h }
  if (age_h > 48) return { health: "critical", age_h }
  if (age_h > 25) return { health: "stale",    age_h }
  return { health: "ok", age_h }
}

const HEALTH_COLORS: Record<Health, { dot: string; label: string; text: string }> = {
  ok:       { dot: "var(--positive)",  label: "ok",      text: "var(--positive)" },
  stale:    { dot: "var(--caution)",   label: "stale",   text: "var(--caution)" },
  critical: { dot: "var(--critical)",  label: "critical", text: "var(--critical)" },
  never:    { dot: "var(--ink-faint)", label: "never",   text: "var(--ink-faint)" },
  running:  { dot: "var(--amber)",     label: "running", text: "var(--amber)" },
}

function fmtAge(h: number | null): string {
  if (h === null) return "—"
  if (h < 1)    return `${Math.round(h * 60)}m ago`
  if (h < 24)   return `${Math.round(h)}h ago`
  return `${Math.round(h / 24)}d ago`
}

function fmtDuration(s: number | null): string {
  if (s === null) return "—"
  if (s < 60)    return `${Math.round(s)}s`
  return `${Math.round(s / 60)}m`
}

async function fetchRecentRuns() {
  const db = await createServiceClient()
  const cutoff = new Date(Date.now() - 7 * 24 * 3_600_000).toISOString()
  return db
    .from("cron_runs")
    .select("job_name, status, started_at, finished_at")
    .gte("started_at", cutoff)
    .order("started_at", { ascending: false })
    .limit(500)
}

export async function UptimeHeartbeatCard() {
  const { data, error } = await fetchRecentRuns()

  if (error) console.error("[UptimeHeartbeatCard] query failed:", error.message)

  // Build map: job_name → latest run row
  const latestByJob = new Map<string, { status: string; started_at: string; finished_at: string | null }>()
  for (const row of data ?? []) {
    if (!latestByJob.has(row.job_name)) {
      latestByJob.set(row.job_name, {
        status:      row.status as string,
        started_at:  row.started_at as string,
        finished_at: row.finished_at as string | null,
      })
    }
  }

  // Also include any jobs in the last 7 days that aren't in DAILY_JOBS
  const extraJobs = [...latestByJob.keys()].filter((j) => !DAILY_JOBS.includes(j))
  const allJobs = [...DAILY_JOBS, ...extraJobs]

  const jobs: JobHealth[] = allJobs.map((name) => {
    const row  = latestByJob.get(name) ?? null
    const { health, age_h } = classify(row)
    const duration_s = row?.finished_at && row.started_at
      ? (new Date(row.finished_at).getTime() - new Date(row.started_at).getTime()) / 1000
      : null
    return {
      job_name:    name,
      status:      row?.status ?? null,
      started_at:  row?.started_at ?? null,
      finished_at: row?.finished_at ?? null,
      duration_s,
      health,
      age_h,
    }
  })

  const criticalCount = jobs.filter((j) => j.health === "critical").length
  const staleCount    = jobs.filter((j) => j.health === "stale").length

  return (
    <div style={{
      background: "var(--paper-raised)",
      border: criticalCount > 0
        ? "1px solid oklch(0.55 0.18 25 / 0.4)"
        : "1px solid var(--rule)",
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
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
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
        </div>
      </div>

      {/* Job grid */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0 }}>
        {jobs.map((job, i) => {
          const h = HEALTH_COLORS[job.health]
          const isRight = i % 2 === 1
          return (
            <div
              key={job.job_name}
              style={{
                padding: "10px 16px",
                borderBottom: "1px solid var(--rule)",
                borderLeft: isRight ? "1px solid var(--rule)" : undefined,
                borderLeftColor: job.health === "critical" ? "var(--critical)" : undefined,
                borderLeftWidth: job.health === "critical" ? 3 : undefined,
                display: "flex",
                alignItems: "center",
                gap: 10,
              }}
            >
              {/* Status dot */}
              <span style={{
                width: 8,
                height: 8,
                borderRadius: "50%",
                flexShrink: 0,
                background: h.dot,
                boxShadow: job.health === "ok" ? `0 0 0 2px color-mix(in oklch, ${h.dot} 25%, transparent)` : undefined,
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
                {job.job_name}
              </span>

              {/* Last run age */}
              <span style={{
                fontFamily: "var(--mono)",
                fontSize: 11,
                color: h.text,
                whiteSpace: "nowrap",
              }}>
                {fmtAge(job.age_h)}
              </span>

              {/* Duration */}
              {job.duration_s !== null && (
                <span style={{
                  fontFamily: "var(--mono)",
                  fontSize: 10.5,
                  color: "var(--ink-faint)",
                  whiteSpace: "nowrap",
                }}>
                  {fmtDuration(job.duration_s)}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
