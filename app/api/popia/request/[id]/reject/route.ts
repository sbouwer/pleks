/**
 * app/api/popia/request/[id]/reject/route.ts — Agency rejects a data-subject request
 *
 * Route:  POST /api/popia/request/:id/reject
 * Auth:   Agency staff (org member)
 * Data:   data_subject_requests (UPDATE)
 * Notes:  resolution_notes and resolution_legal_basis are required for rejection (s24 basis).
 *         Subject is emailed the rejection + IR escalation path via popia.request_rejected
 *         template (Phase 7 wires the email; route records the resolution now).
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { transitionRequestStatus } from "@/lib/popia/requests"
import { logQueryError } from "@/lib/supabase/logQueryError"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const body = await req.json() as {
    notes: string
    legal_basis: string
  }

  if (!body.notes || !body.legal_basis) {
    return NextResponse.json(
      { error: "notes and legal_basis are required for rejection (POPIA s24)" },
      { status: 400 },
    )
  }

  const db = createServiceClient()
  const { data: request, error } = await (await db)
    .from("data_subject_requests")
    .select("org_id")
    .eq("id", id)
    .single()

  if (error || !request) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const { data: membership, error: membershipError } = await (await db)
    .from("user_orgs")
    .select("org_id")
    .eq("user_id", user.id)
    .eq("org_id", request.org_id)
    .is("deleted_at", null)
    .single()
    logQueryError("POST user_orgs", membershipError)

  if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  await transitionRequestStatus(id, "rejected", {
    actor_user_id: user.id,
    notes: body.notes,
    legal_basis: body.legal_basis,
  })

  // Phase 7: dispatch popia.request_rejected email with IR escalation path here

  return NextResponse.json({ ok: true })
}
