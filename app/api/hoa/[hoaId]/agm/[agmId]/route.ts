/**
 * app/api/hoa/[hoaId]/agm/[agmId]/route.ts — update an AGM meeting record (status, attendance, quorum)
 *
 * Route:  PATCH /api/hoa/[hoaId]/agm/[agmId]
 * Auth:   gateway() (agent session + org membership)
 * Data:   agm_records, updated WHERE id = agmId AND hoa_id AND org_id (org-scoped).
 * Notes:  Config write → gateway(), intentionally NOT requireAgentWriteAccess: recording AGM outcomes is
 *         scheme admin on an existing HOA ("your data, always"). agmId/hoaId are caller-supplied → scoped.
 */
import { NextRequest, NextResponse } from "next/server"
import { gateway } from "@/lib/supabase/gateway"

// PATCH /api/hoa/[hoaId]/agm/[agmId] — update status, attendees, quorum, notes
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ hoaId: string; agmId: string }> }
) {
  const { hoaId, agmId } = await params
  const gw = await gateway()
  if (!gw) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { db, orgId } = gw

  const body = await req.json() as {
    status?: string
    attendees_count?: number
    proxy_count?: number
    quorum_achieved?: boolean
    notes?: string
  }

  const { data, error } = await db
    .from("agm_records")
    .update({
      ...(body.status !== undefined && { status: body.status }),
      ...(body.attendees_count !== undefined && { attendees_count: body.attendees_count }),
      ...(body.proxy_count !== undefined && { proxy_count: body.proxy_count }),
      ...(body.quorum_achieved !== undefined && { quorum_achieved: body.quorum_achieved }),
      ...(body.notes !== undefined && { notes: body.notes }),
    })
    .eq("id", agmId)
    .eq("hoa_id", hoaId)
    .eq("org_id", orgId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
