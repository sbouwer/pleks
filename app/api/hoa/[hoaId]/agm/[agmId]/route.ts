/**
 * app/api/hoa/[hoaId]/agm/[agmId]/route.ts — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { logQueryError } from "@/lib/supabase/logQueryError"

// PATCH /api/hoa/[hoaId]/agm/[agmId] — update status, attendees, quorum, notes
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ hoaId: string; agmId: string }> }
) {
  const { hoaId, agmId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { data: membership, error: membershipError } = await supabase
    .from("user_orgs")
    .select("org_id")
    .eq("user_id", user.id)
    .is("deleted_at", null)
    .single()
    logQueryError("PATCH user_orgs", membershipError)
  if (!membership) return NextResponse.json({ error: "No org" }, { status: 403 })

  const body = await req.json() as {
    status?: string
    attendees_count?: number
    proxy_count?: number
    quorum_achieved?: boolean
    notes?: string
  }

  const { data, error } = await supabase
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
    .eq("org_id", membership.org_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
