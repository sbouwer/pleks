/**
 * app/api/cron/screening-line-runner/route.ts — Picks up READY_TO_RUN screening lines and calls Searchworx
 *
 * Route:  GET /api/cron/screening-line-runner
 * Auth:   x-cron-secret header
 * Notes:  Runs every 15 minutes via cPanel curl cron (Vercel Hobby = 1 cron slot taken by /api/cron/daily).
 *         Queries v_application_screening_lines for 'ready_to_run' lines, marks each 'running',
 *         calls runStandardBundle (ADDENDUM_14H Phase 2 — Combined + VCCB bundle),
 *         marks 'complete' or 'failed'. Idempotent: optimistic claim via UPDATE ... WHERE status IN (...)
 *         RETURNING id — if 0 rows returned, another runner already owns the line and we skip.
 *         Max 50 lines per invocation to stay within 15-minute windows.
 *         Phase C: after all subjects for an application are complete, triggers runFitScoreOrchestrator.
 */
import { NextRequest, NextResponse } from "next/server"
import * as Sentry from "@sentry/nextjs"
import { createServiceClient } from "@/lib/supabase/server"
import { runStandardBundle } from "@/lib/screening/bundle-runner"
import { runFitScoreOrchestrator } from "@/lib/screening/fitScoreOrchestrator"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { withCronRun } from "@/lib/cron/withCronRun"
import { optionalEnv } from "@/lib/env"
import { recordAudit } from "@/lib/audit/recordAudit"

const BATCH_SIZE = 50

export const GET = withCronRun("screening_line_runner", handler)

async function handler(_req: NextRequest): Promise<Response> {

  const service = await createServiceClient()
  const results: Record<string, string> = {}
  let processed = 0
  let failed = 0

  try {
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

  return NextResponse.json({ ok: true, processed, failed, results })
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
  let claimed: { id: string }[] | null = null
  if (line.subject_type === "company") {
    const { data, error: queryError } = await service
      .from("applications")
      .update({ searchworx_check_status: "running" })
      .eq("id", line.application_id)
      .in("searchworx_check_status", ["pending", "not_run"])
      .select("id")
    logQueryError("processLine applications", queryError)
    claimed = data
  } else {
    const { data, error: queryError2 } = await service
      .from("application_co_applicants")
      .update({ searchworx_check_status: "running" })
      .eq("id", line.subject_id)
      .in("searchworx_check_status", ["pending", "not_run"])
      .select("id")
    logQueryError("processLine application_co_applicants", queryError2)
    claimed = data
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
  if (line.subject_type === "company") {
    await service
      .from("applications")
      .update({ searchworx_check_status: "complete", searchworx_checked_at: now })
      .eq("id", line.application_id)
  } else {
    await service
      .from("application_co_applicants")
      .update({ searchworx_check_status: "complete", searchworx_checked_at: now })
      .eq("id", line.subject_id)
  }

  // Audit trail
  await recordAudit(service, { orgId: line.org_id, table: line.subject_type === "company" ? "applications" : "application_co_applicants", recordId: line.subject_id, action: "UPDATE", after: { searchworx_check_status: "complete", searchworx_checked_at: now } })
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
