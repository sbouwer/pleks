/**
 * lib/screening/sweepStrandedClaims.ts — return abandoned screening claims to a terminal state
 *
 * Auth:   service-role client, supplied by the caller (the screening-line-runner cron)
 * Data:   applications · application_co_applicants — status 'running' older than the threshold → 'failed'
 * Notes:  M-111. The runner claims a line by writing `searchworx_check_status = 'running'`, which the
 *         claim predicate (`IN ('pending','not_run')`) can never match again. A process killed
 *         mid-run — OOM, deploy, platform timeout — reaches no catch block BY CONSTRUCTION, so the
 *         catch in the runner cannot be the recovery mechanism; only a sweep that measures elapsed
 *         time can. Lives here rather than in the route so it can be probed directly: a Next.js
 *         route file may only export HTTP methods.
 */
import * as Sentry from "@sentry/nextjs"
import type { createServiceClient } from "@/lib/supabase/server"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { recordAudit } from "@/lib/audit/recordAudit"

type Svc = Awaited<ReturnType<typeof createServiceClient>>

/**
 * How old a claim must be before it counts as abandoned.
 *
 * DERIVED, not picked round — a threshold below the real tail reclaims a line that is still in
 * flight, and re-running the bundle INSERTs a second set of `application_screening_lines` rows with
 * their own `cost_cents`. That is a second defect wearing the first one's fix: one screening, billed
 * twice.
 *
 * M-111 asks for observed p99 SearchWorx duration. There is none — `applications` held 0 rows on
 * 2026-09-08 and no bundle has ever run in production — so the honest basis is the STRUCTURAL bound
 * the code already enforces:
 *
 *   `searchworxCall` caps each request at 60s (`timeout_ms ?? 60_000`, via AbortController) and
 *   retries the auth path at most once → ≤120s per product. The Standard bundle is two products →
 *   ≤240s of SearchWorx wall time, plus DB round-trips and PDF storage.
 *
 * 30 minutes is 7.5× that bound and, separately, ≥2 runner cadences (the cron fires every 15m), so a
 * line can never be reclaimed while a run started in the previous cadence could still be alive.
 * Vercel's own function cap (60s on Hobby) kills a run long before 240s — which is precisely the
 * abandoned-claim case this sweep exists for.
 *
 * REPLACE THIS with a real p99 once production has run enough bundles to have one, and say in the
 * comment which measurement it came from.
 */
export const STRANDED_CLAIM_MINUTES = 30

const CLAIMED_TABLES = ["applications", "application_co_applicants"] as const

/**
 * Marks stranded claims 'failed' and returns how many were swept.
 *
 * TERMINAL rather than re-claimable, deliberately. Sending the row back to 'pending' would make the
 * runner retry it, and we cannot tell from here whether the SearchWorx call actually happened before
 * the process died — so an automatic retry is a possible automatic re-charge. Whether a failed
 * screening is retried, and who pays for the retry, is a product decision. This makes the line
 * visible so somebody can take it, which is what it could not be before.
 */
export async function sweepStrandedClaims(service: Svc, nowMs: number = Date.now()): Promise<number> {
  const cutoff = new Date(nowMs - STRANDED_CLAIM_MINUTES * 60_000).toISOString()
  let swept = 0

  for (const table of CLAIMED_TABLES) {
    const { data, error } = await service
      .from(table)
      .update({ searchworx_check_status: "failed" })
      .eq("searchworx_check_status", "running")
      .lt("searchworx_run_started_at", cutoff)
      .select("id, org_id")
    logQueryError(`sweepStrandedClaims ${table}`, error)

    for (const row of data ?? []) {
      swept++
      // Loud on purpose. A swept row means a run died without reaching any catch — the class the
      // catch block structurally cannot see — and nothing else would ever mention it.
      console.error(
        `[sweepStrandedClaims] ${table} ${row.id as string}: claim older than ${STRANDED_CLAIM_MINUTES}m, marked failed`,
      )
      await recordAudit(service, {
        orgId: row.org_id as string,
        table,
        recordId: row.id as string,
        action: "UPDATE",
        after: { searchworx_check_status: "failed", reason: "stranded_claim_swept" },
      })
    }
  }

  if (swept > 0) {
    Sentry.captureMessage("screening lines swept from a stranded claim", {
      level: "error",
      extra: { swept, threshold_minutes: STRANDED_CLAIM_MINUTES },
    })
  }
  return swept
}
