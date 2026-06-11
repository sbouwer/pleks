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
import * as Sentry from "@sentry/nextjs"
import { createServiceClient } from "@/lib/supabase/server"
import type { CronJobDetail } from "./cronDigest"

type CronHandler = (req: NextRequest) => Promise<Response>

/** Accept the cron secret via the header (cPanel standard), Authorization Bearer, or a ?secret= query fallback. */
function authorised(req: NextRequest): boolean {
  const secret =
    req.headers.get("x-cron-secret") ??
    req.headers.get("authorization")?.replace("Bearer ", "") ??
    new URL(req.url).searchParams.get("secret")
  return !!process.env.CRON_SECRET && secret === process.env.CRON_SECRET
}

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
      await db.from("cron_runs").insert({
        job_name:      jobName,
        started_at:    startedAt.toISOString(),
        finished_at:   new Date().toISOString(),
        status,
        error_message: errorMessage,
        metadata,
      })
    } catch (e) {
      console.error(`[cron:${jobName}] failed to write cron_runs:`, e instanceof Error ? e.message : String(e))
    }

    return response
  }
}

/**
 * Roll up the last `sinceHours` of cron_runs into per-job digest entries — ONLY for jobs that failed (a failed
 * run, or non-zero emails-failed from the belt). Excludes "daily" (the orchestrator's own row; its sub-jobs are
 * reported in-process). Returned to the orchestrator and merged into the digest detail.
 */
export async function collectCronRunFailures(sinceHours = 24): Promise<Record<string, CronJobDetail>> {
  const db = await createServiceClient()
  const since = new Date(Date.now() - sinceHours * 3600 * 1000).toISOString()

  const { data, error } = await db
    .from("cron_runs")
    .select("job_name, status, error_message, metadata, finished_at")
    .neq("job_name", "daily")
    .gte("finished_at", since)
  if (error) {
    console.error("[cron-digest] failed to read cron_runs:", error.message)
    return {}
  }

  const byJob: Record<string, { total: number; failed: number; emailsFailed: number; lastError?: string }> = {}
  for (const row of data ?? []) {
    const job = (row.job_name as string) ?? "unknown"
    const agg = (byJob[job] ??= { total: 0, failed: 0, emailsFailed: 0 })
    agg.total++
    if (row.status === "failed") {
      agg.failed++
      if (row.error_message) agg.lastError = row.error_message as string
    }
    const ef = (row.metadata as { failed?: number } | null)?.failed
    if (typeof ef === "number") agg.emailsFailed += ef
  }

  const detail: Record<string, CronJobDetail> = {}
  for (const [job, agg] of Object.entries(byJob)) {
    if (agg.failed === 0 && agg.emailsFailed === 0) continue
    let error: string
    if (agg.failed > 0) {
      const tail = agg.lastError ? ` — ${agg.lastError}` : ""
      error = `${agg.failed}/${agg.total} runs failed in ${sinceHours}h${tail}`
    } else {
      error = `${agg.emailsFailed} email(s) failed across ${agg.total} runs in ${sinceHours}h`
    }
    detail[job] = { status: agg.failed > 0 ? "failed" : "partial", failed: agg.emailsFailed || agg.failed, error }
  }
  return detail
}
