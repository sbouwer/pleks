/**
 * app/api/cron/screening-line-runner/route.ts — Picks up READY_TO_RUN screening lines and calls Searchworx
 *
 * Route:  GET /api/cron/screening-line-runner
 * Auth:   x-cron-secret header
 * Notes:  Runs every 15 minutes via cPanel curl cron (Vercel Hobby = 1 cron slot taken by /api/cron/daily).
 *         Queries v_application_screening_lines for 'ready_to_run' lines, marks each 'running',
 *         calls runStandardBundle (ADDENDUM_14H Phase 2 — Combined + VCCB bundle), marks 'complete'
 *         or 'failed'. Idempotent: optimistic claim via UPDATE ... WHERE status IN (...) RETURNING id
 *         — 0 rows means another runner already owns the line and we skip.
 *         Max 50 lines per invocation to stay within 15-minute windows.
 *         Phase C: after all subjects for an application are complete, triggers runFitScoreOrchestrator.
 *
 *         Every invocation first SWEEPS claims that were taken and never finished (M-111). A claim is
 *         a lock; a process killed mid-run — OOM, deploy, platform timeout — reaches no catch block by
 *         construction, so the sweep is the only mechanism that does not assume our own code got to
 *         run. The catch below is better diagnostics; the sweep is the actual recovery.
 *
 *         ⚠ This header said "marks 'complete' or 'failed'" for a long time while 'failed' appeared
 *         in the file five times and NEVER as a database write. It is true as of 2026-09-08.
 */
import { NextRequest, NextResponse } from "next/server"
import * as Sentry from "@sentry/nextjs"
import { createServiceClient } from "@/lib/supabase/server"
import { runStandardBundle } from "@/lib/screening/bundle-runner"
import { runFitScoreOrchestrator } from "@/lib/screening/fitScoreOrchestrator"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { withCronRun } from "@/lib/cron/withCronRun"
import { sweepStrandedClaims } from "@/lib/screening/sweepStrandedClaims"
import { optionalEnv } from "@/lib/env"
import { recordAudit } from "@/lib/audit/recordAudit"

const BATCH_SIZE = 50

export const GET = withCronRun("screening_line_runner", handler)

async function handler(_req: NextRequest): Promise<Response> {

  const service = await createServiceClient()
  const results: Record<string, string> = {}
  let processed = 0
  let failed = 0
  let swept = 0

  try {
    swept = await sweepStrandedClaims(service)

    // Query READY_TO_RUN lines from the orchestration view
    const { data: lines, error: queryErr } = await service
      .from("v_application_screening_lines")
      .select("application_id, subject_type, subject_id, subject_name, org_id")
      .eq("state", "ready_to_run")
      .limit(BATCH_SIZE)

    if (queryErr) {
      console.error("[screening-line-runner] view query failed:", queryErr.message)
      return NextResponse.json({ error: queryErr.message }, { status: 500 })
    }

    for (const line of lines ?? []) {
      try {
        await processLine(service, line)
        results[line.subject_id] = "ok"
        processed++
      } catch (err) {
        const msg = err instanceof Error ? err.message : "unknown"
        results[line.subject_id] = `failed: ${msg}`
        failed++
        // Release the claim. Without this the row keeps a status the claim predicate can never match
        // again, and the applicant — who has paid and consented — is told the check is in progress by
        // a process that is no longer running (M-111). Best-effort: a failure to record the failure
        // must not abort the batch, and the sweep above will collect the row on a later run.
        await markLineFailed(service, line, msg)
        Sentry.captureException(err, {
          tags: { cron_job: "screening_line_runner", subject_type: line.subject_type },
          extra: { subject_id: line.subject_id, application_id: line.application_id },
        })
      }
    }
  } catch (err) {
    Sentry.captureException(err, { tags: { cron_job: "screening_line_runner" } })
    console.error("[screening-line-runner] unhandled error:", err)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }

  return NextResponse.json({ ok: true, processed, failed, swept, results })
}

type Svc = Awaited<ReturnType<typeof createServiceClient>>

async function markLineFailed(service: Svc, line: ScreeningLine, reason: string): Promise<void> {
  const table = line.subject_type === "company" ? "applications" : "application_co_applicants"
  const rowId = line.subject_type === "company" ? line.application_id : line.subject_id

  const { error } = await service
    .from(table)
    .update({ searchworx_check_status: "failed" })
    .eq("id", rowId)
    .eq("org_id", line.org_id)
    .eq("searchworx_check_status", "running")
  if (error) {
    // Do not rethrow — we are already in a catch, and the sweep is the backstop for exactly this.
    console.error(`[screening-line-runner] could not mark ${table} ${rowId} failed:`, error.message)
    return
  }

  await recordAudit(service, {
    orgId: line.org_id, table, recordId: rowId, action: "UPDATE",
    after: { searchworx_check_status: "failed", reason: reason.slice(0, 200) },
  })
}

type ScreeningLine = {
  application_id: string
  subject_type: string
  subject_id: string
  subject_name: string
  org_id: string
}

async function processLine(
  service: Awaited<ReturnType<typeof createServiceClient>>,
  line: ScreeningLine,
): Promise<void> {
  const now = new Date().toISOString()

  // Claim the line: UPDATE only if status is still unstarted, RETURNING id to detect races.
  // If another runner already claimed it, 0 rows are returned and we skip.
  //
  // ⚠ A CLAIM ERROR IS NOT A RACE, and reading it as one is how this route silently did nothing for
  // every company subject it ever saw. `applications.searchworx_check_status` had a CHECK constraint
  // that did not include 'running' (the sibling table had no CHECK at all), so the company claim
  // raised 23514 every time; the error was logged, `data` came back null, and the null was read as
  // "another runner owns this line". The batch then reported ok. The constraint is fixed in
  // 005_operations.sql, and the error path is separated from the empty-result path here so that the
  // next constraint, permission or column defect surfaces as a failure instead of a skip.
  const table = line.subject_type === "company" ? "applications" : "application_co_applicants"
  const rowId = line.subject_type === "company" ? line.application_id : line.subject_id

  const { data: claimed, error: claimError } = await service
    .from(table)
    .update({ searchworx_check_status: "running", searchworx_run_started_at: now })
    .eq("id", rowId)
    .eq("org_id", line.org_id)
    .in("searchworx_check_status", ["pending", "not_run"])
    .select("id")
  if (claimError) {
    logQueryError(`processLine claim ${table}`, claimError)
    throw new Error(`claim failed on ${table} ${rowId}: ${claimError.message}`)
  }

  if (!claimed || claimed.length === 0) return  // Another runner owns this line

  // Run the Standard bundle (Combined + VCCB). Results are written to application_screening_lines.
  await runStandardBundle({
    applicationId: line.application_id,
    subjectType:   line.subject_type as "company" | "co_applicant",
    subjectId:     line.subject_id,
    orgId:         line.org_id,
  })

  await markLineComplete(service, line, now)
  await maybeRunOrchestrator(service, line.application_id)
}

async function markLineComplete(
  service: Awaited<ReturnType<typeof createServiceClient>>,
  line: ScreeningLine,
  now: string,
): Promise<void> {
  const table = line.subject_type === "company" ? "applications" : "application_co_applicants"
  const rowId = line.subject_type === "company" ? line.application_id : line.subject_id

  // searchworx_run_started_at is cleared, not left behind: it is the sweep's input, and a completed
  // row that still carries a claim timestamp is a row the next schema change could re-strand.
  await service
    .from(table)
    .update({ searchworx_check_status: "complete", searchworx_checked_at: now, searchworx_run_started_at: null })
    .eq("id", rowId)
    .eq("org_id", line.org_id)

  // Audit trail
  await recordAudit(service, { orgId: line.org_id, table, recordId: rowId, action: "UPDATE", after: { searchworx_check_status: "complete", searchworx_checked_at: now } })
}

// Runs after every subject completion. If ALL subjects for the application are now
// complete, triggers the FitScore orchestrator. Gated on FITSCORE_V1_ENABLED.
async function maybeRunOrchestrator(
  service: Awaited<ReturnType<typeof createServiceClient>>,
  applicationId: string,
): Promise<void> {
  if (!optionalEnv("FITSCORE_V1_ENABLED")) return

  // Primary applicant must be complete
  const { data: app, error: appErr } = await service
    .from("applications")
    .select("searchworx_check_status")
    .eq("id", applicationId)
    .single()
  if (appErr || !app || app.searchworx_check_status !== "complete") return

  // All co-applicants must be complete
  const { data: coApps, error: coErr } = await service
    .from("application_co_applicants")
    .select("searchworx_check_status")
    .eq("primary_application_id", applicationId)
  if (coErr) return
  if ((coApps ?? []).some(c => c.searchworx_check_status !== "complete")) return

  // All subjects complete — run the FitScore engine
  console.log(`[screening-line-runner] all subjects complete for ${applicationId} — running FitScore orchestrator`)
  const orchResult = await runFitScoreOrchestrator(applicationId, service)
  if (!orchResult.ok) {
    console.error(`[screening-line-runner] FitScore orchestrator failed for ${applicationId}:`, orchResult.reason)
    Sentry.captureMessage("FitScore orchestrator failed", {
      level: "error",
      extra: { application_id: applicationId, reason: orchResult.reason },
    })
  }
}
