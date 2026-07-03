/**
 * app/api/hoa/[hoaId]/agm/[agmId]/resolutions/route.ts — add a resolution to an AGM meeting record
 *
 * Route:  POST /api/hoa/[hoaId]/agm/[agmId]/resolutions
 * Auth:   gateway() (agent session + org membership)
 * Data:   agm_resolutions insert (org-scoped); the parent agm_records row is verified to belong to the
 *         org before inserting (agmId is caller-supplied).
 * Notes:  Config write → gateway(), intentionally NOT requireAgentWriteAccess: recording AGM resolutions
 *         is scheme admin on an existing HOA ("your data, always").
 */
import { NextRequest, NextResponse } from "next/server"
import { gateway } from "@/lib/supabase/gateway"
import { logQueryError } from "@/lib/supabase/logQueryError"

// POST /api/hoa/[hoaId]/agm/[agmId]/resolutions — add a resolution
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ hoaId: string; agmId: string }> }
) {
  const { agmId } = await params
  const gw = await gateway()
  if (!gw) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { db, orgId } = gw

  // Verify the parent AGM belongs to the org (agmId is caller-supplied)
  const { data: agm, error: agmError } = await db
    .from("agm_records")
    .select("id")
    .eq("id", agmId)
    .eq("org_id", orgId)
    .single()
  logQueryError("POST agm_records", agmError)
  if (!agm) return NextResponse.json({ error: "AGM not found" }, { status: 404 })

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

  const { data, error } = await db
    .from("agm_resolutions")
    .insert({
      org_id: orgId,
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
