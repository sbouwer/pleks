/**
 * app/api/hoa/[hoaId]/levy-schedules/route.ts — list/create levy-schedule definitions for an HOA scheme
 *
 * Route:  GET/POST /api/hoa/[hoaId]/levy-schedules
 * Auth:   gateway() (agent session + org membership)
 * Data:   levy_schedules (org-scoped); POST verifies the parent hoa_entities row belongs to the org.
 * Notes:  Config write → gateway(), intentionally NOT requireAgentWriteAccess: defining a levy schedule
 *         is scheme config on an existing HOA ("your data, always"). Running the schedule (generating levy
 *         amounts) is the money path and is lockdown-gated separately in the /calculate route. hoaId is
 *         caller-supplied → org-scoped.
 */
import { NextRequest, NextResponse } from "next/server"
import { gateway } from "@/lib/supabase/gateway"
import { logQueryError } from "@/lib/supabase/logQueryError"

// GET /api/hoa/[hoaId]/levy-schedules — list all schedules for this HOA
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ hoaId: string }> }
) {
  const { hoaId } = await params
  const gw = await gateway()
  if (!gw) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { db, orgId } = gw

  const { data: schedules, error } = await db
    .from("levy_schedules")
    .select("*")
    .eq("hoa_id", hoaId)
    .eq("org_id", orgId)
    .order("effective_from", { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(schedules ?? [])
}

// POST /api/hoa/[hoaId]/levy-schedules — create a levy schedule
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ hoaId: string }> }
) {
  const { hoaId } = await params
  const gw = await gateway()
  if (!gw) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { db, orgId } = gw

  // Verify HOA belongs to the org
  const { data: hoa, error: hoaError } = await db
    .from("hoa_entities")
    .select("id")
    .eq("id", hoaId)
    .eq("org_id", orgId)
    .single()
  logQueryError("POST hoa_entities", hoaError)

  if (!hoa) return NextResponse.json({ error: "HOA not found" }, { status: 404 })

  const body = await req.json() as {
    description: string
    schedule_type: string
    calculation_method: string
    total_budget_cents: number
    effective_from: string
    include_vacant_units?: boolean
    building_id?: string | null
  }

  if (!body.description || !body.schedule_type || !body.calculation_method ||
      !body.total_budget_cents || !body.effective_from) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
  }

  const { data: schedule, error } = await db
    .from("levy_schedules")
    .insert({
      org_id: orgId,
      hoa_id: hoaId,
      description: body.description,
      schedule_type: body.schedule_type,
      calculation_method: body.calculation_method,
      total_budget_cents: body.total_budget_cents,
      effective_from: body.effective_from,
      include_vacant_units: body.include_vacant_units ?? true,
      building_id: body.building_id ?? null,
      is_active: true,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(schedule, { status: 201 })
}
