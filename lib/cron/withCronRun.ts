/**
 * lib/cron/withCronRun.ts — one wrapper for every standalone (cPanel-triggered) cron
 *
 * Notes: wrap a route handler — `export const GET = withCronRun("job_name", handler)` — and it centralises the
 *        boilerplate every external cron used to re-implement (often partially): the secret check, run timing,
 *        a cron_runs row (status + counts + error), and Sentry capture on a throw. The daily orchestrator then
 *        rolls up the last 24h of cron_runs failures (collectCronRunFailures) into the single failure-only digest,
 *        so ANY new external cron — FitScore, applications, finance — is observable the moment it's wrapped, with
 *        zero per-author boilerplate. The orchestrator's own in-process jobs are NOT wrapped (it aggregates their
 *        results directly); this is for the out-of-process crons it can't see.
 */
import { NextRequest } from "next/server"
import { isCronAuthorised } from "./auth"
import * as Sentry from "@sentry/nextjs"
import { createServiceClient } from "@/lib/supabase/server"
import { classifyCronRuns, type CronJobDetail, type CronRunRow } from "./cronDigest"
import { TRACKED_CRONS } from "./cadence"

type CronHandler = (req: NextRequest) => Promise<Response>

// The secret check lives in lib/cron/auth.ts — the one place it exists, shared with the 32 routes that
// used to re-type a non-constant-time `!==`. Do not re-implement it here.
const authorised = isCronAuthorised

/** Pull the numeric fields out of a cron's JSON response (sent/failed/processed/…) for cron_runs.metadata. */
function numericFields(body: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(body)) if (typeof v === "number") out[k] = v
  return out
}

export function withCronRun(jobName: string, handler: CronHandler): CronHandler {
  return async (req: NextRequest): Promise<Response> => {
    if (!authorised(req)) return Response.json({ error: "Unauthorized" }, { status: 401 })

    const startedAt = new Date()
    let response: Response
    let status: "completed" | "failed" = "completed"
    let errorMessage: string | null = null
    let metadata: Record<string, unknown> = {}

    try {
      response = await handler(req)
      const body = (await response.clone().json().catch(() => ({}))) as Record<string, unknown>
      const failed = typeof body.failed === "number" ? body.failed : 0
      if (!response.ok || body.ok === false || failed > 0) {
        status = "failed"
        if (typeof body.error === "string") errorMessage = body.error
      }
      metadata = { http_status: response.status, ...numericFields(body) }
    } catch (err) {
      status = "failed"
      errorMessage = err instanceof Error ? err.message : String(err)
      Sentry.captureException(err, { tags: { cron_job: jobName } })
      response = Response.json({ ok: false, error: "cron handler threw" }, { status: 500 })
    }

    // Best-effort cron_runs row — recording must never mask the cron's own result.
    try {
      const db = await createServiceClient()
      const { error } = await db.from("cron_runs").insert({
        job_name:      jobName,
        started_at:    startedAt.toISOString(),
        finished_at:   new Date().toISOString(),
        status,
        error_message: errorMessage,
        metadata,
      })
      if (error) reportLostRow(jobName, status, error.message)
    } catch (e) {
      reportLostRow(jobName, status, e instanceof Error ? e.message : String(e))
    }

    return response
  }
}

/**
 * A cron_runs row that was not written. Best-effort stays right — recording must never mask the cron's own
 * result — but a lost row is not neutral: the digest grades from these rows, so a job whose runs cannot record
 * reads healthier than it is. Until 2026-09-14 this path was unreachable: postgrest-js RETURNS its errors
 * (fetch rejections included) rather than throwing, and the returned `error` was never read, so the catch
 * alone saw nothing (walker F1). Sentry, not only the log, because the lost row is the evidence missing
 * from the one report anyone reads.
 */
function reportLostRow(jobName: string, status: string, message: string): void {
  console.error(`[cron:${jobName}] failed to write cron_runs (run ${status}):`, message)
  Sentry.captureMessage("cron_runs row not written", {
    level: "warning",
    tags:  { cron_job: jobName, kind: "cron_runs_lost" },
    extra: { runStatus: status, message },
  })
}

/**
 * Roll up the last `sinceHours` of cron_runs into per-job digest entries — ONLY for jobs that failed (a failed
 * run, or non-zero emails-failed from the belt). Excludes "daily" (the orchestrator's own row; its sub-jobs are
 * reported in-process). Returned to the orchestrator and merged into the digest detail.
 * The grading — failing (still failing now) versus intermittent (failed, then succeeded) — is
 * classifyCronRuns, kept pure in cronDigest.ts so it is probed without a database.
 */
export async function collectCronRunFailures(sinceHours = 24): Promise<Record<string, CronJobDetail>> {
  const db = await createServiceClient()
  const since = new Date(Date.now() - sinceHours * 3600 * 1000).toISOString()

  const { data, error } = await db
    .from("cron_runs")
    .select("job_name, status, error_message, metadata, finished_at")
    .neq("job_name", "daily")
    .gte("finished_at", since)
    // NEWEST first: PostgREST caps a response at max_rows (1000 in supabase/config.toml), and a cap must drop
    // the oldest rows, never the tail the grade is decided from. classifyCronRuns re-sorts, so this order
    // matters only for which rows survive a cap.
    .order("finished_at", { ascending: false })
  if (error) {
    console.error("[cron-digest] failed to read cron_runs:", error.message)
    return {}
  }
  return classifyCronRuns((data ?? []) as CronRunRow[], sinceHours, { now: Date.now(), freshnessMs: TRACKED_CRONS })
}
