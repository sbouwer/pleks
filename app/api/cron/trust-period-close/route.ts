/**
 * app/api/cron/trust-period-close/route.ts — Monthly trust reconciliation close reminder
 *
 * Route:  GET /api/cron/trust-period-close
 * Auth:   x-cron-secret header (CRON_SECRET env var)
 * Notes:  Runs on the 1st of each month at 05:00 SAST (03:00 UTC) via the daily orchestrator.
 *         Flips prior-month bank_recon_sessions with zero unmatched lines to ready_for_close,
 *         surfacing the "ready to close" CTA in the agent dashboard.
 *         Does NOT auto-close — agent sign-off is always required (D-TRUST-11).
 */

import { type NextRequest } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { requireCronAuth } from "@/lib/cron/auth"

function priorMonthRange(): { start: string; end: string } {
  const now = new Date()
  const y = now.getUTCMonth() === 0 ? now.getUTCFullYear() - 1 : now.getUTCFullYear()
  const m = now.getUTCMonth() === 0 ? 12 : now.getUTCMonth()
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const ms = String(m).padStart(2, "0")
  return {
    start: `${y}-${ms}-01`,
    end: `${y}-${ms}-${String(lastDay).padStart(2, "0")}`,
  }
}

export async function GET(req: NextRequest) {
  const denied = requireCronAuth(req)
  if (denied) return denied

  const db = await createServiceClient()
  const { start, end } = priorMonthRange()

  // Find in_progress sessions for the prior month that have zero unmatched lines
  const { data: readySessions, error: fetchErr } = await db
    .from("bank_recon_sessions")
    .select("id, org_id")
    .gte("period_end", start)
    .lte("period_end", end)
    .eq("status", "in_progress")
    .eq("unmatched_lines", 0)

  if (fetchErr) {
    console.error("[trust-period-close] fetch failed:", fetchErr.message)
    return Response.json({ ok: false, error: fetchErr.message }, { status: 500 })
  }

  const sessions = readySessions ?? []
  let flipped = 0

  for (const session of sessions) {
    const { error: updateErr } = await db
      .from("bank_recon_sessions")
      .update({ status: "ready_for_close" })
      .eq("id", session.id)
      .eq("status", "in_progress")

    if (updateErr) {
      console.error(`[trust-period-close] update failed for session ${session.id}:`, updateErr.message)
    } else {
      flipped++
    }
  }

  return Response.json({
    ok: true,
    period: `${start} to ${end}`,
    sessionsEligible: sessions.length,
    sessionsFlipped: flipped,
  })
}
