/**
 * app/api/cron/cost-snapshots/route.ts — Daily platform cost snapshot builder
 *
 * Route:  GET /api/cron/cost-snapshots
 * Auth:   x-cron-secret header (CRON_SECRET) — called from /api/cron/daily orchestrator; GET kept for direct testability
 * Data:   messaging_usage, ai_usage, organisations (read); platform_cost_snapshots (write)
 * Notes:  Rebuilds current-month rows only. Closed months are frozen (never overwritten).
 *         maxDuration 300s — snapshot build scans multiple tables across all orgs.
 */
import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { buildCostSnapshots } from "@/lib/observability/cost"
import * as Sentry from "@sentry/nextjs"

export const runtime    = "nodejs"
export const maxDuration = 300

export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret") ?? request.headers.get("authorization")?.replace("Bearer ", "")
  if (secret !== process.env.CRON_SECRET) {
    return new NextResponse("Unauthorised", { status: 401 })
  }

  const db    = await createServiceClient()
  const runId = crypto.randomUUID()

  const { error: insertError } = await db.from("cron_runs").insert({
    id:         runId,
    job_name:   "cost-snapshots",
    started_at: new Date().toISOString(),
    status:     "running",
  })
  if (insertError) console.error("[cost-snapshots] cron_runs insert failed:", insertError.message)

  try {
    const result = await buildCostSnapshots({ period: new Date() })

    await db.from("cron_runs").update({
      status:         "completed",
      finished_at:    new Date().toISOString(),
      rows_processed: result.orgsProcessed,
      metadata:       { total_spend_cents: result.totalSpendCents },
    }).eq("id", runId)

    if (process.env.HEARTBEAT_COST_SNAPSHOTS) {
      void fetch(process.env.HEARTBEAT_COST_SNAPSHOTS, { method: "POST" }).catch(() => undefined)
    }

    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown"
    await db.from("cron_runs").update({
      status:       "failed",
      finished_at:  new Date().toISOString(),
      error_message: message,
    }).eq("id", runId)
    Sentry.captureException(err, { tags: { cron: "cost-snapshots" } })
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}
