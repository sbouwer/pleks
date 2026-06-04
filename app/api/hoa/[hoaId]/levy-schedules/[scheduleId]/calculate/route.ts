/**
 * app/api/hoa/[hoaId]/levy-schedules/[scheduleId]/calculate/route.ts — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { calculateLevyAmounts } from "@/lib/hoa/levyCalculation"
import { logQueryError } from "@/lib/supabase/logQueryError"

// POST /api/hoa/[hoaId]/levy-schedules/[scheduleId]/calculate
// Runs the levy calculation engine and saves results to levy_unit_amounts.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ hoaId: string; scheduleId: string }> }
) {
  const { hoaId, scheduleId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Verify the schedule belongs to this HOA and user's org
  const { data: membership, error: membershipError } = await supabase
    .from("user_orgs")
    .select("org_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single()
    logQueryError("POST user_orgs", membershipError)

  if (!membership) return NextResponse.json({ error: "No org" }, { status: 403 })

  const { data: schedule, error: scheduleError } = await supabase
    .from("levy_schedules")
    .select("id, hoa_id, org_id")
    .eq("id", scheduleId)
    .eq("hoa_id", hoaId)
    .eq("org_id", membership.org_id)
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
