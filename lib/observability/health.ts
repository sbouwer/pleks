/**
 * lib/observability/health.ts — Component health check logic for uptime probes
 *
 * Auth:   Server-only — called from /api/health/deep (token-gated) and /api/status (ISR-cached)
 * Data:   prime_rates (DB probe), Resend domains API (email probe), storage.listBuckets,
 *         cron_runs (per-job freshness thresholds in TRACKED_CRONS; every cron writes a row via withCronRun)
 * Notes:  Promise.all across all 4 checks; 5s per-component timeout; never throws.
 *         DB is the only critical dependency — email/storage/crons degrade, not down.
 *         Email check auto-skips when RESEND_API_KEY is absent (not yet configured).
 *         withTimeout accepts PromiseLike<T> so it works with Supabase's thenable builders.
 */
import { createServiceClient } from "@/lib/supabase/server"
import type { SupabaseClient } from "@supabase/supabase-js"
import { Resend } from "resend"
import { HOLIDAY_TABLE_COVERS_THROUGH } from "@/lib/dates/saPublicHolidays"
import { saDateISO } from "@/lib/dates"

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
    delivery_feedback: { status: ComponentStatus; error?: string }
    holiday_table: { status: ComponentStatus; error?: string }
  }
}

export interface Incident {
  id:          string
  title:       string
  started_at:  string
  resolved_at: string | null
  summary:     string
}

const COMPONENT_TIMEOUT_MS = 10000

// Accepts PromiseLike<T> so Supabase's thenable query builders work correctly.
function withTimeout<T>(p: PromiseLike<T>, ms: number): Promise<T> {
  return Promise.race([
    Promise.resolve(p),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), ms)
    ),
  ])
}

// Slow-on-cold-start ≠ down. A real outage returns a query ERROR; a cold-start (this
// is a force-dynamic function idle between BetterStack's 5-min polls) makes the FIRST
// DB call after boot exceed the timeout. So: a query error → "down" (genuine outage);
// a timeout → retry once warm, and if it times out again, "degraded" (200, slowness
// still visible in the body) rather than a false 503. This is the BetterStack false-red fix.
async function checkDb(supabase: SupabaseClient): Promise<HealthReport["components"]["db"]> {
  const probe = () => withTimeout(
    supabase.from("prime_rates").select("effective_date").limit(1),
    COMPONENT_TIMEOUT_MS
  )
  const start = Date.now()
  try {
    const { error } = await probe()
    if (error) {                                    // real DB error → down
      console.error("[health] db check failed:", error.message)
      return { status: "down", latency_ms: Date.now() - start, error: error.message }
    }
    return { status: "ok", latency_ms: Date.now() - start }
  } catch {
    // First attempt timed out (likely cold start). Retry once, warm.
    try {
      const { error } = await probe()
      if (error) return { status: "down", latency_ms: Date.now() - start, error: error.message }
      return { status: "ok", latency_ms: Date.now() - start }
    } catch (error_) {
      // Timed out twice → degrade, do NOT 503. A true outage returns an error
      // (handled above), not a timeout. Slow ≠ down.
      const msg = error_ instanceof Error ? error_.message : "unknown"
      console.error("[health] db check timed out twice (degraded, not down):", msg)
      return { status: "degraded", latency_ms: Date.now() - start, error: `slow: ${msg}` }
    }
  }
}

async function checkEmail(): Promise<HealthReport["components"]["email"]> {
  // Env preflight (comms audit 2026-07-09): a MISSING key is an OUTAGE, not "ok". The June 4–10 outage was
  // a missing RESEND_API_KEY that health reported green precisely because this returned ok — every send
  // failed silently for a week. A missing critical key must show as down.
  if (!process.env.RESEND_API_KEY) return { status: "down", error: "RESEND_API_KEY not configured" }
  try {
    const resend = new Resend(process.env.RESEND_API_KEY)
    const { error } = await withTimeout(resend.domains.list(), COMPONENT_TIMEOUT_MS)
    if (error) return { status: "down", error: error.message }
    return { status: "ok" }
  } catch (e) {
    return { status: "down", error: e instanceof Error ? e.message : "unknown" }
  }
}

async function checkStorage(supabase: SupabaseClient): Promise<HealthReport["components"]["storage"]> {
  try {
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

// Tracked top-level scheduled crons → how long since the last SUCCESS before "stale". Thresholds are ~2–3× the
// cadence so a single transient miss doesn't flap. Every external (cPanel-triggered) cron now writes a cron_runs
// row via withCronRun (lib/cron/withCronRun.ts), so they're all observable here — this is what finally lets
// checkCrons track more than "daily". The orchestrator's IN-PROCESS children are still covered by a fresh
// "daily" row (don't add them — they don't self-insert), and monthly jobs run inside it (day-of-month gated).
// Note: right after the withCronRun deploy the newly-tracked crons have no rows yet, so they read stale until
// their first run (≤~4h for the 4-hourly ones, ≤~24h for the daily ones). That's a truthful, self-healing
// "degraded" — not "down", since "daily" itself stays fresh — not a bug.
const TRACKED_CRONS: Record<string, number> = {
  daily:                   48 * 60 * 60 * 1000,  // daily 05:00 UTC (orchestrator)
  screening_line_runner:    2 * 60 * 60 * 1000,  // every 15m
  mandatory_retry:          3 * 60 * 60 * 1000,  // every 1h
  bank_feed_sync:           9 * 60 * 60 * 1000,  // every 4h
  arrears_sequence:         9 * 60 * 60 * 1000,  // every 4h
  maintenance_delay_check:  9 * 60 * 60 * 1000,  // every 4h
  check_links:              9 * 60 * 60 * 1000,  // every 4h
  application_reminders:   30 * 60 * 60 * 1000,  // daily 06:00 UTC
}
const MAX_TRACKED_THRESHOLD_MS = Math.max(...Object.values(TRACKED_CRONS))

async function checkCrons(supabase: SupabaseClient): Promise<HealthReport["components"]["crons"]> {
  try {
    const trackedNames = Object.keys(TRACKED_CRONS)
    // Bound the read to the largest threshold (+2h margin) and to tracked jobs only, so a 15-min cron's flood
    // of rows can't push the once-daily "daily" row out of view (the old limit(200) bug waiting to happen).
    const windowStart = new Date(Date.now() - MAX_TRACKED_THRESHOLD_MS - 2 * 60 * 60 * 1000).toISOString()
    const { data, error } = await withTimeout(
      supabase
        .from("cron_runs")
        .select("job_name, finished_at")
        .eq("status", "completed")
        .in("job_name", trackedNames)
        .gte("finished_at", windowStart)
        .order("finished_at", { ascending: false })
        .limit(1000),
      COMPONENT_TIMEOUT_MS
    )
    if (error) return { status: "degraded", stale_jobs: ["(query failed)"] }

    const lastSuccess = new Map<string, number>()
    for (const row of data ?? []) {
      if (!row.finished_at) continue
      const ts = new Date(row.finished_at as string).getTime()
      const prev = lastSuccess.get(row.job_name as string)
      if (prev === undefined || ts > prev) lastSuccess.set(row.job_name as string, ts)
    }

    const now = Date.now()
    const stale = trackedNames.filter(name => {
      const last = lastSuccess.get(name)
      return last === undefined || (now - last) > TRACKED_CRONS[name]
    })

    if (stale.length === 0) return { status: "ok" }
    if (stale.length < trackedNames.length) return { status: "degraded", stale_jobs: stale }
    return { status: "down", stale_jobs: stale }
  } catch (e) {
    return { status: "degraded", stale_jobs: [e instanceof Error ? e.message : "unknown"] }
  }
}

// Delivery-feedback silence monitor (comms audit 2026-07-09): the Resend/AT webhooks write
// communication_delivery_events. If outbound EMAIL sends happened in the last 7 days but ZERO delivery
// events arrived, the webhook is not configured (the audit found the table empty all-time) — "sent" then
// means only "Resend accepted", hard-bounce suppression never fires, and the notice suite's deemed-service
// anchors never populate. Surfaces as degraded so it can't stay silently dark.
async function checkDeliveryFeedback(supabase: SupabaseClient): Promise<HealthReport["components"]["delivery_feedback"]> {
  try {
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString()
    const [sendsRes, eventsRes] = await Promise.all([
      withTimeout(supabase.from("communication_log").select("id", { count: "exact", head: true }).eq("channel", "email").gte("created_at", since), COMPONENT_TIMEOUT_MS),
      withTimeout(supabase.from("communication_delivery_events").select("id", { count: "exact", head: true }).gte("received_at", since), COMPONENT_TIMEOUT_MS),
    ])
    const sends = (sendsRes as { count: number | null }).count ?? 0
    const events = (eventsRes as { count: number | null }).count ?? 0
    if (sends > 0 && events === 0) {
      return { status: "degraded", error: `no delivery events in 7d despite ${sends} email sends — Resend webhook likely unconfigured` }
    }
    return { status: "ok" }
  } catch (e) {
    return { status: "degraded", error: e instanceof Error ? e.message : "unknown" }
  }
}


// ── SA public-holiday table horizon (the statutory backstop's early-warning) ─────────────────────────
// addBusinessDays THROWS past the table's horizon rather than silently shortening a tenant's cure period.
// That throw must be the backstop, never the plan — so nag from 90 days out, while there is still an ops
// calendar to act on. When this fires, extend the table AND check the Gazette for newly proclaimed
// once-off holidays: the table is a compliance process, not a code artefact.
const HOLIDAY_HORIZON_WARN_DAYS = 90

export function checkHolidayTable(now: Date = new Date()): HealthReport["components"]["holiday_table"] {
  const todayIso = saDateISO(now)
  if (todayIso > HOLIDAY_TABLE_COVERS_THROUGH) {
    return {
      status: "down",
      error: `SA public-holiday table expired on ${HOLIDAY_TABLE_COVERS_THROUGH} — statutory business-day ` +
        `computations are now THROWING. Extend SA_PUBLIC_HOLIDAYS_* in lib/dates/saPublicHolidays.ts.`,
    }
  }
  const warnFrom = new Date(now.getTime() + HOLIDAY_HORIZON_WARN_DAYS * 86_400_000)
  if (saDateISO(warnFrom) > HOLIDAY_TABLE_COVERS_THROUGH) {
    return {
      status: "degraded",
      error: `SA public-holiday table runs out on ${HOLIDAY_TABLE_COVERS_THROUGH} (inside ` +
        `${HOLIDAY_HORIZON_WARN_DAYS} days). Extend it and check the Government Gazette for newly ` +
        `proclaimed once-off holidays before statutory deadline computations start failing.`,
    }
  }
  return { status: "ok" }
}

export async function checkHealth(): Promise<HealthReport> {
  const supabase = await createServiceClient()
  const [db, email, storage, crons, delivery_feedback] = await Promise.all([
    checkDb(supabase), checkEmail(), checkStorage(supabase), checkCrons(supabase), checkDeliveryFeedback(supabase),
  ])
  const holiday_table = checkHolidayTable()

  let aggregate: ComponentStatus = "ok"
  if (db.status === "down") aggregate = "down"
  else if (email.status !== "ok" || storage.status !== "ok" || crons.status !== "ok" || delivery_feedback.status !== "ok" || holiday_table.status !== "ok") aggregate = "degraded"

  return {
    status:      aggregate,
    version:     process.env.NEXT_PUBLIC_APP_VERSION ?? "unknown",
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? "unknown",
    timestamp:   new Date().toISOString(),
    components:  { db, email, storage, crons, delivery_feedback, holiday_table },
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
