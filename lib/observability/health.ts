/**
 * lib/observability/health.ts — Component health check logic for uptime probes
 *
 * Auth:   Server-only — called from /api/health/deep (token-gated) and /api/status (ISR-cached)
 * Data:   prime_rates (DB probe), Resend domains API (email probe), storage.listBuckets,
 *         cron_runs (jobs that write to it: daily orchestrator, insurance-renewals, info-requests)
 * Notes:  Promise.all across all 4 checks; 1.5s per-component timeout; never throws.
 *         DB is the only critical dependency — email/storage/crons degrade, not down.
 *         withTimeout accepts PromiseLike<T> so it works with Supabase's thenable builders.
 */
import { createServiceClient } from "@/lib/supabase/server"
import { Resend } from "resend"

export type ComponentStatus = "ok" | "degraded" | "down"

export interface HealthReport {
  status:      ComponentStatus
  version:     string
  environment: string
  timestamp:   string
  components: {
    db:      { status: ComponentStatus; latency_ms?: number; error?: string }
    email:   { status: ComponentStatus; error?: string }
    storage: { status: ComponentStatus; error?: string }
    crons:   { status: ComponentStatus; stale_jobs?: string[] }
  }
}

export interface Incident {
  id:          string
  title:       string
  started_at:  string
  resolved_at: string | null
  summary:     string
}

const COMPONENT_TIMEOUT_MS = 3000

// Accepts PromiseLike<T> so Supabase's thenable query builders work correctly.
function withTimeout<T>(p: PromiseLike<T>, ms: number): Promise<T> {
  return Promise.race([
    Promise.resolve(p),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), ms)
    ),
  ])
}

async function checkDb(): Promise<HealthReport["components"]["db"]> {
  const start = Date.now()
  try {
    const supabase = await createServiceClient()
    const { error } = await withTimeout(
      supabase.from("prime_rates").select("effective_date").limit(1),
      COMPONENT_TIMEOUT_MS
    )
    if (error) {
      console.error("[health] db check failed:", error.message)
      return { status: "down", latency_ms: Date.now() - start, error: error.message }
    }
    return { status: "ok", latency_ms: Date.now() - start }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown"
    console.error("[health] db check exception:", msg)
    return { status: "down", latency_ms: Date.now() - start, error: msg }
  }
}

async function checkEmail(): Promise<HealthReport["components"]["email"]> {
  try {
    if (!process.env.RESEND_API_KEY) return { status: "degraded", error: "RESEND_API_KEY not configured" }
    const resend = new Resend(process.env.RESEND_API_KEY)
    const { error } = await withTimeout(resend.domains.list(), COMPONENT_TIMEOUT_MS)
    if (error) return { status: "down", error: error.message }
    return { status: "ok" }
  } catch (e) {
    return { status: "down", error: e instanceof Error ? e.message : "unknown" }
  }
}

async function checkStorage(): Promise<HealthReport["components"]["storage"]> {
  try {
    const supabase = await createServiceClient()
    const { error } = await withTimeout(
      supabase.storage.listBuckets(),
      COMPONENT_TIMEOUT_MS
    )
    if (error) return { status: "down", error: error.message }
    return { status: "ok" }
  } catch (e) {
    return { status: "down", error: e instanceof Error ? e.message : "unknown" }
  }
}

// Jobs that write to cron_runs — must match actual job_name values in handlers.
// "daily" is written by the orchestrator itself; others write their own entries.
const TRACKED_DAILY_JOBS = ["daily", "insurance-renewals", "expire-info-requests", "cost-snapshots"]

async function checkCrons(): Promise<HealthReport["components"]["crons"]> {
  try {
    const supabase = await createServiceClient()
    const { data, error } = await withTimeout(
      supabase
        .from("cron_runs")
        .select("job_name, finished_at, status")
        .eq("status", "completed")
        .order("finished_at", { ascending: false })
        .limit(200),
      COMPONENT_TIMEOUT_MS
    )
    if (error) return { status: "degraded", stale_jobs: ["(query failed)"] }

    const lastSuccess = new Map<string, Date>()
    for (const row of data ?? []) {
      if (!row.finished_at) continue
      const ts = new Date(row.finished_at as string)
      const prev = lastSuccess.get(row.job_name as string)
      if (!prev || ts > prev) lastSuccess.set(row.job_name as string, ts)
    }

    const now = Date.now()
    const stale = TRACKED_DAILY_JOBS.filter(name => {
      const last = lastSuccess.get(name)
      if (!last) return true
      return (now - last.getTime()) > 48 * 60 * 60 * 1000
    })

    if (stale.length === 0) return { status: "ok" }
    if (stale.length < TRACKED_DAILY_JOBS.length) return { status: "degraded", stale_jobs: stale }
    return { status: "down", stale_jobs: stale }
  } catch (e) {
    return { status: "degraded", stale_jobs: [e instanceof Error ? e.message : "unknown"] }
  }
}

export async function checkHealth(): Promise<HealthReport> {
  const [db, email, storage, crons] = await Promise.all([
    checkDb(), checkEmail(), checkStorage(), checkCrons(),
  ])

  let aggregate: ComponentStatus = "ok"
  if (db.status === "down") aggregate = "down"
  else if (email.status !== "ok" || storage.status !== "ok" || crons.status !== "ok") aggregate = "degraded"

  return {
    status:      aggregate,
    version:     process.env.NEXT_PUBLIC_APP_VERSION ?? "unknown",
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? "unknown",
    timestamp:   new Date().toISOString(),
    components:  { db, email, storage, crons },
  }
}

export async function fetchBetterStackIncidents(): Promise<Incident[]> {
  if (!process.env.BETTERSTACK_API_KEY) return []
  try {
    const res = await fetch("https://uptime.betterstack.com/api/v2/incidents?limit=10", {
      headers: { Authorization: `Bearer ${process.env.BETTERSTACK_API_KEY}` },
      next: { revalidate: 60 },
    })
    if (!res.ok) return []
    const json = await res.json() as {
      data?: Array<{
        id: string
        attributes?: { name?: string; started_at?: string; resolved_at?: string; cause?: string }
      }>
    }
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
    return (json.data ?? [])
      .filter(i => {
        const d = i.attributes?.started_at
        return d ? new Date(d).getTime() > sevenDaysAgo : false
      })
      .map(i => ({
        id:          i.id,
        title:       i.attributes?.name ?? "Incident",
        started_at:  i.attributes?.started_at ?? "",
        resolved_at: i.attributes?.resolved_at ?? null,
        summary:     i.attributes?.cause ?? "",
      }))
  } catch {
    return []
  }
}
