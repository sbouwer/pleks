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
 *         Phase C: after all subjects for an application are complete, triggers runFitScoreOrchestrator
 *         (lib/screening/maybeRunOrchestrator.ts — shared with the deadline decline, 14W §0b).
 *         ADDENDUM_14X N3: the transition to complete (and only it — completeSubject is guarded) tells the other
 *         outstanding parties and the lead who is still outstanding (lib/screening/milestoneNotices.ts; held until
 *         counsel approves the copy, when it records the gap instead).
 *
 *         Every invocation first SWEEPS claims that were taken and never finished (M-111). A claim is
 *         a lock; a process killed mid-run — OOM, deploy, platform timeout — reaches no catch block by
 *         construction, so the sweep is the only mechanism that does not assume our own code got to
 *         run. The catch below is better diagnostics; the sweep is the actual recovery.
 *
 *         ⚠ This header said "marks 'complete' or 'failed'" for a long time while 'failed' appeared
 *         in the file five times and NEVER as a database write. It is true as of 2026-09-08.
 *
 *         BOUNDED PRODUCT RETRY (ADDENDUM_14W §0c). A product that fails inside the bundle writes a `failed` line
 *         without throwing. After each run the subject's run is planned (lib/screening/retryPlan.ts): a product under
 *         SCREENING_PRODUCT_MAX_ATTEMPTS sends the subject back to `pending` and the next tick RESUMES the same run,
 *         calling only the products not yet delivered. Once every product is delivered or terminal, a terminal product
 *         records its refund as owed (lib/screening/refundOwed.ts) and the subject completes.
 *         A bureau outage is an ATTEMPT, not a throw: bundle-runner turns a product call that throws (timeout, 5xx,
 *         network) into a `failed` line, so the bound counts it (walker 14w-s0c F1). What still throws is a data or
 *         write defect — no ID number, no consent, a line insert that failed — and that marks the subject `failed`
 *         for a person, because retrying it would re-bill without ever reaching the bound. A lines READ that fails
 *         hands the claim back to `pending` instead: nothing has been bought on that path, or the lines already landed.
 */
import { NextRequest, NextResponse } from "next/server"
import * as Sentry from "@sentry/nextjs"
import { createServiceClient } from "@/lib/supabase/server"
import { runStandardBundle } from "@/lib/screening/bundle-runner"
import { isApplicationSubject, type ScreeningSubjectType } from "@/lib/screening/consentGuard"
import { maybeRunOrchestrator } from "@/lib/screening/maybeRunOrchestrator"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { withCronRun } from "@/lib/cron/withCronRun"
import { sweepStrandedClaims } from "@/lib/screening/sweepStrandedClaims"
import { recordAudit } from "@/lib/audit/recordAudit"
import { planRun, type RunPlan } from "@/lib/screening/retryPlan"
import { recordOwedRefund } from "@/lib/screening/refundOwed"
import { completeSubject } from "@/lib/screening/completeSubject"

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
  const table = isApplicationSubject(line.subject_type) ? "applications" : "application_co_applicants"
  const rowId = isApplicationSubject(line.subject_type) ? line.application_id : line.subject_id

  const { data: marked, error } = await service
    .from(table)
    .update({ searchworx_check_status: "failed" })
    .eq("id", rowId)
    .eq("org_id", line.org_id)
    .eq("searchworx_check_status", "running")
    .select("id")
  if (error) {
    // Do not rethrow — we are already in a catch, and the sweep is the backstop for exactly this.
    console.error(`[screening-line-runner] could not mark ${table} ${rowId} failed:`, error.message)
    return
  }
  // Nothing marked = the claim was already handed back (a lines read failed, 14W §0c). An audit row saying "failed"
  // would describe a state the row is not in.
  if (!marked?.length) return

  await recordAudit(service, {
    orgId: line.org_id, table, recordId: rowId, action: "UPDATE",
    after: { searchworx_check_status: "failed", reason: reason.slice(0, 200) },
  })
}

type ScreeningLine = {
  application_id: string
  subject_type: ScreeningSubjectType
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
  const table = isApplicationSubject(line.subject_type) ? "applications" : "application_co_applicants"
  const rowId = isApplicationSubject(line.subject_type) ? line.application_id : line.subject_id

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

  // A run still retrying is RESUMED, not restarted: same run id, delivered products not bought again (14W §0c).
  // A failed read here costs nothing yet — no product has been called — so the claim is handed back, not failed.
  const before = await readSubjectRun(service, line).catch(async (e: unknown) => {
    await releaseForRetry(service, line, null, [], "lines_read_failed")
    throw e
  })
  // A pending subject whose latest run already SETTLED is a settle that was interrupted (a read or write failed after
  // the lines landed). The only other writer of `pending` is the PayFast ITN, behind its duplicate guard, so this is
  // never a re-screen request: finish the settle and call nothing — a new run would buy the whole bundle again.
  let run = before?.plan.action === "settle" ? before : null
  if (!run) {
    const resume = before?.plan.action === "retry" ? before : null

    // Run the Standard bundle (Combined + VCCB). Results are written to application_screening_lines.
    const { screeningRunId } = await runStandardBundle({
      applicationId:  line.application_id,
      subjectType:    line.subject_type,
      subjectId:      line.subject_id,
      orgId:          line.org_id,
      screeningRunId: resume?.runId,
      skipProducts:   resume?.plan.delivered,
    })

    // A failed read AFTER the run hands the claim back too: the lines are written, so the next tick's read plans the
    // same run — resumes it if a product is still retrying, else settles it (above) without calling anything.
    run = await readSubjectRun(service, line, screeningRunId).catch(async (e: unknown) => {
      await releaseForRetry(service, line, screeningRunId, [], "lines_read_failed")
      throw e
    })
    if (!run) throw new Error(`no screening lines recorded for run ${screeningRunId}`)

    if (run.plan.action === "retry") {
      await releaseForRetry(service, line, screeningRunId, run.plan.retrying, "product_retry")
      return
    }
  }
  if (run.plan.action !== "settle") return

  // Settled: every product delivered or terminal. A terminal product is the one refund trigger (counsel Q6), recorded
  // as owed for an admin to execute; it does not hold the subject back — the assessment runs on what was delivered.
  // recordOwedRefund is idempotent on the payment row, so a re-entered settle cannot owe twice.
  if (run.plan.terminal.length > 0) {
    await recordOwedRefund(service, {
      orgId: line.org_id, applicationId: line.application_id, subjectType: line.subject_type, subjectId: line.subject_id,
    }, run.plan.terminal, run.plan.completed)
  }
  // Marks complete once and, on that transition only, sends 14X N3 to the others (lib/screening/completeSubject.ts).
  await completeSubject(service, line, now)
  await maybeRunOrchestrator(service, line.org_id, line.application_id)
}

/**
 * The subject's latest run (or the named one) and its plan. Every attempt inserts its own line, so the rows are the
 * attempt counter. A read error THROWS: planning on an empty read would settle a run with nothing in it.
 */
async function readSubjectRun(
  service: Svc, line: ScreeningLine, runId?: string,
): Promise<{ runId: string; plan: RunPlan } | null> {
  let q = service
    .from("application_screening_lines")
    .select("screening_run_id, product_key, status, created_at")
    .eq("org_id", line.org_id)
    .eq("application_id", line.application_id)
    .eq("subject_type", line.subject_type)
    .eq("subject_id", line.subject_id)
  if (runId) q = q.eq("screening_run_id", runId)
  const { data, error } = await q.order("created_at", { ascending: false })
  if (error) {
    logQueryError("readSubjectRun application_screening_lines", error)
    throw new Error(`screening lines read failed: ${error.message}`)
  }
  const rows = data ?? []
  if (rows.length === 0) return null
  const latest = runId ?? rows[0].screening_run_id
  return { runId: latest, plan: planRun(rows.filter((r) => r.screening_run_id === latest)) }
}

/**
 * Hand the subject back to the queue: status `pending` is what the view's ready_to_run reads, so the next tick
 * re-claims it and resumes the run. Guarded on `running` — a sweep or another writer that moved it wins.
 */
async function releaseForRetry(
  service: Svc, line: ScreeningLine, runId: string | null, retrying: string[], reason: "product_retry" | "lines_read_failed",
): Promise<void> {
  const table = isApplicationSubject(line.subject_type) ? "applications" : "application_co_applicants"
  const rowId = isApplicationSubject(line.subject_type) ? line.application_id : line.subject_id

  const { error } = await service
    .from(table)
    .update({ searchworx_check_status: "pending", searchworx_run_started_at: null })
    .eq("id", rowId)
    .eq("org_id", line.org_id)
    .eq("searchworx_check_status", "running")
  if (error) {
    logQueryError(`releaseForRetry ${table}`, error)
    throw new Error(`retry release failed on ${table} ${rowId}: ${error.message}`)
  }

  await recordAudit(service, {
    orgId: line.org_id, table, recordId: rowId, action: "UPDATE",
    after: { searchworx_check_status: "pending", reason, screening_run_id: runId, retrying },
  })
}
