/**
 * app/api/hoa/[hoaId]/agm/route.ts — list/create AGM meeting records for an HOA scheme
 *
 * Route:  GET/POST /api/hoa/[hoaId]/agm
 * Auth:   gateway() (agent session + org membership)
 * Data:   agm_records (+ agm_resolutions on GET), org-scoped via gateway orgId; POST verifies the parent
 *         hoa_entities row belongs to the org before inserting.
 * Notes:  Config write → gateway(), intentionally NOT requireAgentWriteAccess: scheduling an AGM is
 *         scheme admin on an existing HOA ("your data, always"). hoaId is caller-supplied → org-scoped.
 */
import { NextRequest, NextResponse } from "next/server"
import { gateway } from "@/lib/supabase/gateway"
import { logQueryError } from "@/lib/supabase/logQueryError"

// GET /api/hoa/[hoaId]/agm — list meetings with resolutions
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ hoaId: string }> }
) {
  const { hoaId } = await params
  const gw = await gateway()
  if (!gw) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { db, orgId } = gw

  const { data: records, error: recordsError } = await db
    .from("agm_records")
    .select("*, agm_resolutions(*)")
    .eq("hoa_id", hoaId)
    .eq("org_id", orgId)
    .order("meeting_date", { ascending: false })
  logQueryError("GET agm_records", recordsError)

  return NextResponse.json(records ?? [])
}

// POST /api/hoa/[hoaId]/agm — create a meeting record
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ hoaId: string }> }
) {
  const { hoaId } = await params
  const gw = await gateway()
  if (!gw) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { db, userId, orgId } = gw

  // Verify HOA ownership
  const { data: hoa, error: hoaError } = await db
    .from("hoa_entities")
    .select("id")
    .eq("id", hoaId)
    .eq("org_id", orgId)
    .single()
  logQueryError("POST hoa_entities", hoaError)
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

  const { data: record, error } = await db
    .from("agm_records")
    .insert({
      org_id: orgId,
      hoa_id: hoaId,
      agm_type: body.agm_type,
      meeting_date: body.meeting_date,
      meeting_time: body.meeting_time ?? null,
      location: body.location?.trim() ?? null,
      is_virtual: body.is_virtual ?? false,
      virtual_link: body.virtual_link?.trim() ?? null,
      notes: body.notes?.trim() ?? null,
      status: "scheduled",
      created_by: userId,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(record, { status: 201 })
}
