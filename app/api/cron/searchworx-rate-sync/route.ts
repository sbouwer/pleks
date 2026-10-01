/**
 * app/api/cron/searchworx-rate-sync/route.ts — daily Searchworx rate sync (ADDENDUM_14V §3.3)
 *
 * Route:  GET /api/cron/searchworx-rate-sync[?date=YYYY-MM-DD]  (date = backfill one billing day, today or earlier)
 * Auth:   x-cron-secret header (requireCronAuth) — runs inside the daily orchestrator; GET kept for direct testability
 * Data:   Searchworx /billingreports/company/ (yesterday) → searchworx_rate_observations; compares against
 *         searchworx_rates and inserts a rate row only on a plausible change; its own cron_runs row
 * Notes:  The logic is lib/searchworx/rates/sync.ts; this file is auth, the cron_runs row and Sentry.
 *         cron_runs follows the cost-snapshots pattern the spec cites (§7 step 6): a "running" row first, then
 *         completed/failed, so a run that dies mid-way is visible as running rather than absent.
 *         A billing source failure is an immediate Sentry error + 502 — the prime-rate-sync doctrine: a silently
 *         stale rate would otherwise only surface when someone is charged against it. The comparison still ran
 *         over what was already recorded before that 502 is returned.
 *         A held rate (beyond plausibilityThresholdPct) and a date collision are Sentry errors — the alert is
 *         the control (§4). Staleness and unmapped billing names are warnings. Description from the billing
 *         report never reaches this file: billing.ts copies named fields only (§3.2b).
 */
import { NextRequest, NextResponse } from "next/server"
import * as Sentry from "@sentry/nextjs"
import { createServiceClient } from "@/lib/supabase/server"
import { requireCronAuth } from "@/lib/cron/auth"
import { saTodayISO } from "@/lib/dates"
import { fetchBillingReport } from "@/lib/searchworx/billingReport"
import { runRateSync } from "@/lib/searchworx/rates/sync"
import { PRICING_POLICY } from "@/lib/screening/pricingPolicy.v1"

export const runtime = "nodejs"

const JOB = "searchworx-rate-sync"
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

export async function GET(request: NextRequest) {
  const denied = requireCronAuth(request)
  if (denied) return denied

  // Backfill (ruled 2026-10-01): ?date=YYYY-MM-DD fetches that one day instead of yesterday. Re-running a day
  // records nothing twice (billing_key), so a backfill is safe to repeat — which is also why TODAY is allowed:
  // a partial day records what is billed so far, and tomorrow's scheduled run adds the rest. The future is refused.
  const today = saTodayISO()
  const date = request.nextUrl.searchParams.get("date")
  if (date !== null && (!ISO_DAY.test(date) || date > today)) {
    return NextResponse.json({ error: "date must be today or a past day, YYYY-MM-DD" }, { status: 400 })
  }

  const db = await createServiceClient()
  const runId = crypto.randomUUID()
  const { error: insertError } = await db.from("cron_runs").insert({
    id: runId,
    job_name: JOB,
    started_at: new Date().toISOString(),
    status: "running",
  })
  if (insertError) console.error(`[${JOB}] cron_runs insert failed:`, insertError.message)

  try {
    const result = await runRateSync(db, {
      today,
      billingDay: date ?? undefined,
      fetchBilling: fetchBillingReport,
      thresholdPct: PRICING_POLICY.plausibilityThresholdPct,
      staleAfterDays: PRICING_POLICY.staleAfterDays,
    })

    for (const a of result.alerts) {
      Sentry.captureMessage(a.message, { level: a.level, tags: { cron: JOB }, extra: a.extra })
    }
    if (result.sourceFailure) {
      Sentry.captureException(new Error(`${JOB}: ${result.sourceFailure}`), {
        level: "error",
        tags: { cron: JOB, severity: "source_failed" },
      })
    }

    const failed = result.sourceFailure !== null
    const { error: updateError } = await db
      .from("cron_runs")
      .update({
        status: failed ? "failed" : "completed",
        finished_at: new Date().toISOString(),
        rows_processed: result.summary.recorded,
        error_message: result.sourceFailure,
        metadata: { billing_day: result.billingDay, ...result.summary },
      })
      .eq("id", runId)
    if (updateError) console.error(`[${JOB}] cron_runs update failed:`, updateError.message)

    return NextResponse.json(
      { ok: !failed, error: result.sourceFailure ?? undefined, billing_day: result.billingDay, ...result.summary },
      { status: failed ? 502 : 200 },
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown"
    const { error: updateError } = await db
      .from("cron_runs")
      .update({ status: "failed", finished_at: new Date().toISOString(), error_message: message })
      .eq("id", runId)
    if (updateError) console.error(`[${JOB}] cron_runs update failed:`, updateError.message)
    Sentry.captureException(err, { tags: { cron: JOB } })
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
