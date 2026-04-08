import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"

const VALID_CONTRACTOR_TRANSITIONS: Record<string, string[]> = {
  work_order_sent: ["acknowledged"],
  acknowledged: ["in_progress", "acknowledged"], // acknowledged again = rescheduled note
  in_progress: ["pending_completion"],
}

export async function POST(req: Request) {
  const body = await req.json() as {
    requestId: string
    token: string
    new_status: string
    completion_notes?: string
    actual_cost?: string
    reschedule_notes?: string
    decline_notes?: string
  }

  const { requestId, token, new_status: newStatus } = body

  if (!requestId || !token || !newStatus) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
  }

  const supabase = await createServiceClient()

  // Verify token
  const { data: request } = await supabase
    .from("maintenance_requests")
    .select("id, status, work_order_token, org_id")
    .eq("id", requestId)
    .single()

  if (!request || request.work_order_token !== token) {
    return NextResponse.json({ error: "Invalid token" }, { status: 403 })
  }

  const allowed = VALID_CONTRACTOR_TRANSITIONS[request.status] ?? []
  if (!allowed.includes(newStatus)) {
    return NextResponse.json({ error: `Cannot transition from ${request.status} to ${newStatus}` }, { status: 400 })
  }

  const updates: Record<string, unknown> = { status: newStatus }

  if (newStatus === "pending_completion") {
    updates.completion_notes = body.completion_notes ?? null
    if (body.actual_cost) {
      updates.actual_cost_cents = Math.round(Number.parseFloat(body.actual_cost) * 100)
    }
    updates.completed_at = null // will be set on agent sign-off
  }

  const { error } = await supabase
    .from("maintenance_requests")
    .update(updates)
    .eq("id", requestId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Log to contractor_updates
  const notes = body.reschedule_notes ?? body.decline_notes ?? body.completion_notes ?? null
  await supabase.from("contractor_updates").insert({
    request_id: requestId,
    new_status: newStatus,
    notes,
    updated_by: "contractor_portal",
    created_at: new Date().toISOString(),
  })

  return NextResponse.json({ ok: true })
}
