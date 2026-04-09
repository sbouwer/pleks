import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// POST /api/hoa/[hoaId]/agm/[agmId]/resolutions — add a resolution
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ hoaId: string; agmId: string }> }
) {
  const { agmId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: membership } = await supabase
    .from("user_orgs")
    .select("org_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single()
  if (!membership) return NextResponse.json({ error: "No org" }, { status: 403 })

  const body = await req.json() as {
    resolution_number?: number
    resolution_type: string
    description: string
    result?: string
    votes_for?: number
    votes_against?: number
    votes_abstained?: number
    notes?: string
  }

  if (!body.description?.trim() || !body.resolution_type) {
    return NextResponse.json({ error: "description and resolution_type required" }, { status: 400 })
  }

  const { data, error } = await supabase
    .from("agm_resolutions")
    .insert({
      org_id: membership.org_id,
      agm_id: agmId,
      resolution_number: body.resolution_number ?? null,
      resolution_type: body.resolution_type,
      description: body.description.trim(),
      result: body.result ?? null,
      votes_for: body.votes_for ?? null,
      votes_against: body.votes_against ?? null,
      votes_abstained: body.votes_abstained ?? null,
      notes: body.notes?.trim() ?? null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
