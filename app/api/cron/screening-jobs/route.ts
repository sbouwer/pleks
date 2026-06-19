/**
 * app/api/cron/screening-jobs/route.ts — durable pre-screen retry sweep (ADDENDUM_14M)
 *
 * Route:  GET /api/cron/screening-jobs
 * Auth:   x-cron-secret (withCronRun; cPanel curl)
 * Data:   screening_jobs, application_tokens (service client) → re-fires /api/applications/[id]/screen
 * Notes:  This is the RELIABILITY BACKBONE, not a mere safety net — with no waitUntil, the submit-side fire
 *         may never flush, so this sweep is what guarantees screening completes. Wire it to a TIGHT cPanel
 *         schedule (every 1–2 min) — its cadence sets how long an applicant watches the processing spinner
 *         when the immediate fire didn't survive. Resets stale 'running' jobs (a died invocation) back to
 *         claimable, then dispatches every pending/failed job with attempts left. Dispatch is best-effort
 *         (short timeout) — /screen runs as its own invocation; the next tick re-fires anything that didn't land.
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { withCronRun } from "@/lib/cron/withCronRun"
import { logQueryError } from "@/lib/supabase/logQueryError"

function getServiceClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

const STUCK_MS = 5 * 60 * 1000   // a 'running' job older than this = a died invocation → reclaim
const BATCH = 20

export const GET = withCronRun("screening_jobs", handler)

async function handler(req: NextRequest): Promise<Response> {
  const db = getServiceClient()
  const nowIso = new Date().toISOString()

  // Reclaim stale 'running' jobs (the /screen invocation died mid-run). attempts is left as-is.
  await db.from("screening_jobs")
    .update({ status: "failed", error: "stuck (invocation timed out)", updated_at: nowIso })
    .eq("status", "running").lt("started_at", new Date(Date.now() - STUCK_MS).toISOString())

  const { data: jobs, error: jobsErr } = await db.from("screening_jobs")
    .select("id, application_id, attempts, max_attempts")
    .in("status", ["pending", "failed"])
    .order("created_at", { ascending: true }).limit(BATCH)
  logQueryError("screening-jobs cron select", jobsErr)

  let fired = 0
  for (const job of jobs ?? []) {
    if (job.attempts >= job.max_attempts) continue
    const { data: tok, error: tokErr } = await db.from("application_tokens")
      .select("token").eq("application_id", job.application_id)
      .gt("expires_at", nowIso).order("created_at", { ascending: false }).limit(1).maybeSingle()
    logQueryError("screening-jobs cron token", tokErr)
    if (!tok) continue
    try {
      await fetch(`${req.nextUrl.origin}/api/applications/${job.application_id}/screen`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: tok.token }), signal: AbortSignal.timeout(2500),
      })
      fired++
    } catch { /* /screen runs as its own invocation; next tick re-fires if it didn't land */ }
  }

  return NextResponse.json({ ok: true, swept: jobs?.length ?? 0, fired })
}
