/**
 * app/api/cron/daily/route.ts — Daily cron orchestrator — runs all scheduled jobs sequentially
 *
 * Route:  GET /api/cron/daily
 * Auth:   x-cron-secret header (CRON_SECRET env var) — triggered by a cPanel curl cron
 *         at 05:00 UTC (Vercel Cron removed: its Authorization-injection was the fragile
 *         link; cPanel's explicit x-cron-secret to app.pleks.co.za is what works reliably).
 * Notes:  Orchestrates every truly-daily job sequentially; monthly jobs gated by
 *         day-of-month check. High-frequency jobs run via their own cPanel curl crons and
 *         are NOT included here: mandatory-retry (1h), bank-feed-sync, arrears-sequence,
 *         maintenance-delay-check, check-links (4h).
 */
import { NextRequest } from "next/server"
import * as Sentry from "@sentry/nextjs"
import { createServiceClient } from "@/lib/supabase/server"
import { GET as invoiceGenerate } from "../invoice-generate/route"
import { GET as leaseExpiryCheck } from "../lease-expiry-check/route"
import { GET as scheduledReports } from "../scheduled-reports/route"
import { GET as ownerStatementGen } from "../owner-statement-gen/route"
import { GET as depositInterest } from "../deposit-interest/route"
import { GET as depositDeadlineCheck } from "../deposit-deadline-check/route"
import { GET as levyGenerate } from "../levy-generate/route"
import { GET as trustPeriodClose } from "../trust-period-close/route"
import { GET as arrearsInterest } from "../arrears-interest/route"
import { GET as trialExpiry } from "../trial-expiry/route"
import { GET as billingCascade } from "../billing-cascade/route"
import { GET as purgeImportData } from "../purge-import-data/route"
import { GET as primeRateSync } from "../prime-rate-sync/route"
import { GET as infoRequests } from "../info-requests/route"
import { GET as insuranceRenewals } from "../insurance-renewals/route"
import { GET as feedbackDigest } from "../feedback-digest/route"
import { GET as costSnapshots } from "../cost-snapshots/route"
import { GET as processAuditExports } from "../process-audit-exports/route"
import { GET as preMoveoutInspection } from "../tenant-comms/pre-moveout-inspection/route"
import { GET as depositInterestStatement } from "../tenant-comms/deposit-interest-statement/route"
import { GET as inspectionReminder } from "../tenant-comms/inspection-reminder/route"
import { GET as leaseLifecycle } from "../tenant-comms/lease-lifecycle/route"
import { GET as monthlyStatement } from "../tenant-comms/monthly-statement/route"
import { GET as subscriptionDunning } from "../subscription-dunning/route"
import { GET as subscriptionDormancy } from "../subscription-dormancy/route"
import { GET as subscriptionPurgeWarnings } from "../subscription-purge-warnings/route"
import { GET as screeningPortalReminders } from "../screening-portal-reminders/route"
import { GET as consentCleanup } from "../consent-cleanup/route"
import { GET as popiaRetentionPurge } from "../popia-retention-purge/route"
import { runLegalArchiveStep } from "@/lib/legal/archive"
import { runRulesEngine, type EngineRuleSummary } from "@/lib/rules/engine"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { sendCronDigest, type CronJobDetail } from "@/lib/cron/cronDigest"
import { collectCronRunFailures } from "@/lib/cron/withCronRun"

export const runtime     = "nodejs"
export const maxDuration = 90   // Hobby caps at 60s; honoured on Pro. ~11s typical run.

type CronHandler = (req: NextRequest) => Promise<Response>

async function runJob(
  name: string,
  handler: CronHandler,
  cronReq: NextRequest,
  results: Record<string, string>,
  detail: Record<string, CronJobDetail>
) {
  try {
    const res = await handler(cronReq)
    results[name] = res.ok ? "ok" : "failed"
    // Capture the C-1 belt's { sent, failed } so the digest can flag "ran ok but N emails failed".
    let body: { sent?: number; failed?: number } = {}
    try { body = await res.json() } catch { /* non-JSON body — fine */ }
    detail[name] = { status: results[name], sent: body?.sent, failed: body?.failed }
  } catch (err) {
    Sentry.captureException(err, { tags: { cron_job: name } })
    results[name] = "error"
    detail[name] = { status: "error", error: err instanceof Error ? err.message : String(err) }
  }
}

export async function GET(req: NextRequest) {
  const secret = req.headers.get("x-cron-secret") ?? req.headers.get("authorization")?.replace("Bearer ", "")
  if (secret !== process.env.CRON_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const results: Record<string, string> = {}
  const detail: Record<string, CronJobDetail> = {}
  const today = new Date()
  const dayOfMonth = today.getUTCDate()

  const cronReq = new NextRequest(req.url, {
    headers: new Headers({ "x-cron-secret": process.env.CRON_SECRET! }),
  })

  // Track in cron_runs — read by /api/health/deep cron freshness check
  const service = await createServiceClient()
  const { data: cronRun, error: cronRunError } = await service.from("cron_runs").insert({
    job_name:   "daily",
    started_at: today.toISOString(),
    status:     "running",
  }).select("id").single()
    logQueryError("GET cron_runs", cronRunError)
  const cronRunId = cronRun?.id ?? null

  // Daily jobs
  await runJob("invoice_generate", invoiceGenerate, cronReq, results, detail)
  await runJob("lease_expiry_check", leaseExpiryCheck, cronReq, results, detail)
  await runJob("scheduled_reports", scheduledReports, cronReq, results, detail)
  await runJob("deposit_interest", depositInterest, cronReq, results, detail)
  await runJob("deposit_deadline_check", depositDeadlineCheck, cronReq, results, detail)
  await runJob("arrears_interest", arrearsInterest, cronReq, results, detail)
  await runJob("trial_expiry", trialExpiry, cronReq, results, detail)
  await runJob("billing_cascade", billingCascade, cronReq, results, detail)
  await runJob("purge_import_data", purgeImportData, cronReq, results, detail)
  await runJob("prime_rate_sync", primeRateSync, cronReq, results, detail)
  await runJob("info_requests", infoRequests, cronReq, results, detail)
  await runJob("insurance_renewals", insuranceRenewals, cronReq, results, detail)
  await runJob("feedback_digest", feedbackDigest, cronReq, results, detail)
  await runJob("cost_snapshots", costSnapshots, cronReq, results, detail)
  await runJob("process_audit_exports", processAuditExports, cronReq, results, detail)
  await runJob("pre_moveout_inspection", preMoveoutInspection, cronReq, results, detail)
  await runJob("inspection_reminder", inspectionReminder, cronReq, results, detail)
  await runJob("lease_lifecycle", leaseLifecycle, cronReq, results, detail)
  await runJob("monthly_statement", monthlyStatement, cronReq, results, detail)
  await runJob("subscription_dunning", subscriptionDunning, cronReq, results, detail)
  await runJob("subscription_dormancy", subscriptionDormancy, cronReq, results, detail)
  await runJob("subscription_purge_warnings", subscriptionPurgeWarnings, cronReq, results, detail)
  await runJob("screening_portal_reminders", screeningPortalReminders, cronReq, results, detail)
  await runJob("consent_cleanup", consentCleanup, cronReq, results, detail)
  await runJob("popia_retention_purge", popiaRetentionPurge, cronReq, results, detail)

  // Legal archive — called directly (not via runJob) so structured result goes into cron_runs.metadata
  let legalArchive: import("@/lib/legal/archive").LegalArchiveResult = {}
  try {
    legalArchive = await runLegalArchiveStep(service, { triggeredAt: today })
    const anyFailed = Object.values(legalArchive).some(r => r.outcome === "fetch_failed" || r.outcome === "upload_failed")
    results.legal_archive = anyFailed ? "failed" : "ok"
  } catch (err) {
    Sentry.captureException(err, { tags: { cron_job: "legal_archive" } })
    results.legal_archive = "error"
  }

  // Rules engine — runs after all legacy jobs
  let engineSummary: Record<string, EngineRuleSummary> = {}
  try {
    engineSummary = await runRulesEngine(service, "daily", today)
    const anyErrors = Object.values(engineSummary).some(s => s.errors > 0)
    results.rules_engine = anyErrors ? "partial" : "ok"
  } catch (err) {
    Sentry.captureException(err, { tags: { cron_job: "rules_engine" } })
    results.rules_engine = "error"
  }

  // Monthly jobs
  if (dayOfMonth === 1) {
    await runJob("levy_generate", levyGenerate, cronReq, results, detail)
    await runJob("deposit_interest_statement", depositInterestStatement, cronReq, results, detail)
    await runJob("trust_period_close", trustPeriodClose, cronReq, results, detail)
  } else {
    results.levy_generate = "skipped (not 1st)"
    results.deposit_interest_statement = "skipped (not 1st)"
    results.trust_period_close = "skipped (not 1st)"
  }

  if (dayOfMonth === 2) {
    await runJob("owner_statement_gen", ownerStatementGen, cronReq, results, detail)
  } else {
    results.owner_statement_gen = "skipped (not 2nd)"
  }

  // Finish cron_runs entry
  if (cronRunId) {
    await service.from("cron_runs").update({
      finished_at:    new Date().toISOString(),
      status:         "completed",
      rows_processed: Object.keys(results).length,
      metadata:       { legal_archive: legalArchive, rules_engine: engineSummary },
    }).eq("id", cronRunId)
  }

  if (process.env.HEARTBEAT_DAILY) {
    await fetch(process.env.HEARTBEAT_DAILY, { method: "POST" }).catch(() => undefined)
  }

  // Failure-only digest: fold in statuses set outside runJob (legal_archive, rules_engine, skipped monthly) +
  // the last 24h of EXTERNAL (out-of-process, cPanel-triggered) cron failures from cron_runs, then email
  // ADMIN_EMAIL ONCE iff anything failed. A clean run across all crons sends nothing.
  for (const [name, status] of Object.entries(results)) detail[name] ??= { status }
  Object.assign(detail, await collectCronRunFailures(24))
  const digest = await sendCronDigest(today.toISOString(), detail)

  // Hygiene: keep cron_runs bounded (the wrapper writes a row per external-cron invocation).
  // eslint-disable-next-line pleks/require-scope-on-delete -- cron_runs is platform-level (no org_id); age-based purge
  await service.from("cron_runs").delete().lt("started_at", new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString())

  return Response.json({ ok: true, ran_at: today.toISOString(), results, digest })
}
