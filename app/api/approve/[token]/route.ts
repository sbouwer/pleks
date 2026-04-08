import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const body = await req.json() as { requestId: string; decision: "approve" | "reject" | "quote_requested"; rejection_reason?: string }

  const { requestId, decision, rejection_reason } = body

  if (!requestId || !decision) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 })
  }

  const supabase = await createServiceClient()

  // Verify token
  const { data: request } = await supabase
    .from("maintenance_requests")
    .select("id, status, landlord_approval_token, org_id")
    .eq("id", requestId)
    .single()

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

  await supabase.from("audit_log").insert({
    org_id: request.org_id,
    table_name: "maintenance_requests",
    record_id: requestId,
    action: "UPDATE",
    changed_by: null,
    new_values: { status: newStatus, decision },
  })

  return NextResponse.json({ ok: true, newStatus })
}
