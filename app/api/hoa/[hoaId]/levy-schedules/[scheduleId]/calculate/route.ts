/**
 * app/api/hoa/[hoaId]/levy-schedules/[scheduleId]/calculate/route.ts — run the levy engine for a schedule
 *
 * Route:  POST /api/hoa/[hoaId]/levy-schedules/[scheduleId]/calculate
 * Auth:   requireAgentWriteAccess("calculate_levies") — generating levy amounts is a financial output
 *         (net-new value), so it is subscription-lockdown gated.
 * Data:   verifies the schedule belongs to the org, then calculateLevyAmounts() writes levy_unit_amounts.
 * Notes:  Lockdown surfaces as a clean 403 ({ code: "subscription_locked" }), never a 500.
 */
import { NextRequest, NextResponse } from "next/server"
import { requireAgentWriteAccess } from "@/lib/auth/server"
import { SubscriptionLockdownError } from "@/lib/subscriptions/state"
import { calculateLevyAmounts } from "@/lib/hoa/levyCalculation"
import { logQueryError } from "@/lib/supabase/logQueryError"

// POST /api/hoa/[hoaId]/levy-schedules/[scheduleId]/calculate
// Runs the levy calculation engine and saves results to levy_unit_amounts.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ hoaId: string; scheduleId: string }> }
) {
  const { hoaId, scheduleId } = await params
  let gw
  try {
    gw = await requireAgentWriteAccess("calculate_levies")
  } catch (e) {
    if (e instanceof SubscriptionLockdownError) {
      return NextResponse.json({ error: e.message, code: "subscription_locked" }, { status: 403 })
    }
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const { db, orgId } = gw

  // Verify the schedule belongs to this HOA and the caller's org
  const { data: schedule, error: scheduleError } = await db
    .from("levy_schedules")
    .select("id, hoa_id, org_id")
    .eq("id", scheduleId)
    .eq("hoa_id", hoaId)
    .eq("org_id", orgId)
    .single()
  logQueryError("POST levy_schedules", scheduleError)

  if (!schedule) return NextResponse.json({ error: "Schedule not found" }, { status: 404 })

  try {
    const result = await calculateLevyAmounts(scheduleId)
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Calculation failed"
    return NextResponse.json({ error: message }, { status: 422 })
  }
}
