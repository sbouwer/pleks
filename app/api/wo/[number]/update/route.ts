/**
 * app/api/wo/[number]/update/route.ts — contractor advances a work-order's status via the portal
 *
 * Route:  POST /api/wo/[number]/update
 * Auth:   token — the [number] URL segment (work_order_number) is authoritative; body token must equal
 *         that request's work_order_token AND the token must not be revoked (verifyWorkOrderAccess)
 * Data:   updates maintenance_requests.status; inserts contractor_updates
 * Notes:  identity is derived from the URL work_order_number, not a caller-supplied body id; transitions gated by VALID_CONTRACTOR_TRANSITIONS
 */
import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { verifyWorkOrderAccess } from "@/lib/maintenance/verifyWorkOrderAccess"

const VALID_CONTRACTOR_TRANSITIONS: Record<string, string[]> = {
  work_order_sent: ["acknowledged"],
  acknowledged: ["in_progress", "acknowledged"], // acknowledged again = rescheduled note
  in_progress: ["pending_completion"],
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ number: string }> },
) {
  const { number } = await params
  const body = await req.json() as {
    token: string
    new_status: string
    completion_notes?: string
    actual_cost?: string
    reschedule_notes?: string
    decline_notes?: string
  }

  const { token, new_status: newStatus } = body

  if (!token || !newStatus) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
  }

  const supabase = await createServiceClient()

  // Auth: URL work_order_number is authoritative; validates token + revocation.
  const request = await verifyWorkOrderAccess(supabase, number, token)
  if (!request) {
    return NextResponse.json({ error: "Invalid token" }, { status: 403 })
  }
  const requestId = request.id

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
    actor_name: "Contractor (portal)",
    created_at: new Date().toISOString(),
  })

  return NextResponse.json({ ok: true })
}
