/**
 * app/api/approve/[token]/route.ts — landlord approve/reject/request-quote on a maintenance request
 *
 * Route:  POST /api/approve/[token]
 * Auth:   token — body requestId's landlord_approval_token must equal the [token] segment
 * Data:   reads/updates maintenance_requests; inserts audit_log
 * Notes:  only acts on status 'pending_landlord'; quote_requested reverts status to 'approved'
 */
import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { recordAudit } from "@/lib/audit/recordAudit"

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const body = await req.json() as { requestId: string; decision: "approve" | "reject" | "quote_requested"; rejection_reason?: string }

  const { requestId, decision, rejection_reason } = body

  if (!requestId || !decision) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 })
  }

  const supabase = await createServiceClient()

  // Verify token
  const { data: request, error: requestError } = await supabase
    .from("maintenance_requests")
    .select("id, status, landlord_approval_token, org_id")
    .eq("id", requestId)
    .single()
    logQueryError("POST maintenance_requests", requestError)

  if (!request || request.landlord_approval_token !== token) {
    return NextResponse.json({ error: "Invalid token" }, { status: 403 })
  }

  if (!["pending_landlord"].includes(request.status)) {
    return NextResponse.json({ error: "Request is not awaiting landlord approval" }, { status: 400 })
  }

  const now = new Date().toISOString()
  let newStatus: string
  const updates: Record<string, unknown> = {
    landlord_approved_by: "landlord_portal",
    landlord_approved_at: now,
  }

  if (decision === "approve") {
    newStatus = "landlord_approved"
  } else if (decision === "reject") {
    newStatus = "landlord_rejected"
    updates.landlord_rejection_reason = rejection_reason ?? null
  } else {
    // quote_requested — put back to approved, mark as needing quote
    newStatus = "approved"
    updates.special_instructions = "Landlord requested formal quote before work proceeds."
  }

  updates.status = newStatus

  const { error } = await supabase
    .from("maintenance_requests")
    .update(updates)
    .eq("id", requestId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await recordAudit(supabase, { orgId: request.org_id, table: "maintenance_requests", recordId: requestId, action: "UPDATE", actorId: null, after: { status: newStatus, decision } })

  return NextResponse.json({ ok: true, newStatus })
}
