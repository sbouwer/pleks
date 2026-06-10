/**
 * app/api/cron/deposit-deadline-check/route.ts — daily cron: flip lapsed deposit-return timers to overdue
 *
 * Route:  /api/cron/deposit-deadline-check
 * Auth:   x-cron-secret header
 * Data:   deposit_timers via service client
 * Notes:  The statutory deposit-return deadline (14-day no-damage / 21-day damage) is stored on deposit_timers
 *         but nothing flipped a running timer to 'overdue' once it passed — a breach could lapse silently. This
 *         flips running → overdue past the deadline date so it surfaces (the lease deposit page already reads
 *         status). Run from the daily orchestrator. ADDENDUM_FINANCIAL_INTEGRITY F-4.
 */
import { NextRequest } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"

export async function GET(req: NextRequest) {
  if (req.headers.get("x-cron-secret") !== process.env.CRON_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }

  const supabase = await createServiceClient()
  const today = new Date().toISOString().slice(0, 10)  // deadline is a date column

  const { data, error } = await supabase
    .from("deposit_timers")
    .update({ status: "overdue" })
    .eq("status", "running")
    .lt("deadline", today)
    .select("id")

  if (error) {
    console.error("[deposit-deadline-check] flip failed:", error.message)
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ ok: true, flipped: data?.length ?? 0 })
}
