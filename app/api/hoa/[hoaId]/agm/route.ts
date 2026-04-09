import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// GET /api/hoa/[hoaId]/agm — list meetings with resolutions
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ hoaId: string }> }
) {
  const { hoaId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: records } = await supabase
    .from("agm_records")
    .select("*, agm_resolutions(*)")
    .eq("hoa_id", hoaId)
    .order("meeting_date", { ascending: false })

  return NextResponse.json(records ?? [])
}

// POST /api/hoa/[hoaId]/agm — create a meeting record
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ hoaId: string }> }
) {
  const { hoaId } = await params
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

  // Verify HOA ownership
  const { data: hoa } = await supabase
    .from("hoa_entities")
    .select("id")
    .eq("id", hoaId)
    .eq("org_id", membership.org_id)
    .single()
  if (!hoa) return NextResponse.json({ error: "HOA not found" }, { status: 404 })

  const body = await req.json() as {
    agm_type: string
    meeting_date: string
    meeting_time?: string
    location?: string
    is_virtual?: boolean
    virtual_link?: string
    notes?: string
  }

  if (!body.agm_type || !body.meeting_date) {
    return NextResponse.json({ error: "agm_type and meeting_date required" }, { status: 400 })
  }

  const { data: record, error } = await supabase
    .from("agm_records")
    .insert({
      org_id: membership.org_id,
      hoa_id: hoaId,
      agm_type: body.agm_type,
      meeting_date: body.meeting_date,
      meeting_time: body.meeting_time ?? null,
      location: body.location?.trim() ?? null,
      is_virtual: body.is_virtual ?? false,
      virtual_link: body.virtual_link?.trim() ?? null,
      notes: body.notes?.trim() ?? null,
      status: "scheduled",
      created_by: user.id,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(record, { status: 201 })
}
