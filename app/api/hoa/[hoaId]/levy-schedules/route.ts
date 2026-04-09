import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// GET /api/hoa/[hoaId]/levy-schedules — list all schedules for this HOA
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ hoaId: string }> }
) {
  const { hoaId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: schedules, error } = await supabase
    .from("levy_schedules")
    .select("*")
    .eq("hoa_id", hoaId)
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
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // Resolve org membership
  const { data: membership } = await supabase
    .from("user_orgs")
    .select("org_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single()

  if (!membership) return NextResponse.json({ error: "No org" }, { status: 403 })

  // Verify HOA belongs to user's org
  const { data: hoa } = await supabase
    .from("hoa_entities")
    .select("id")
    .eq("id", hoaId)
    .eq("org_id", membership.org_id)
    .single()

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

  const { data: schedule, error } = await supabase
    .from("levy_schedules")
    .insert({
      org_id: membership.org_id,
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
