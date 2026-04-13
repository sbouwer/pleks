"use server"

import { gateway } from "@/lib/supabase/gateway"

interface RescheduleResponsePayload {
  requestId: string
  inspectionId: string
  action: "approved" | "declined" | "countered"
  agentResponse: string | null
  resolvedDate: string | null
}

export async function respondToRescheduleRequest(payload: RescheduleResponsePayload) {
  const gw = await gateway()
  if (!gw) return { error: "Not authenticated" }

  const { db, orgId, userId } = gw

  // Verify the reschedule request belongs to this org
  const { data: req, error: reqErr } = await db
    .from("inspection_reschedule_requests")
    .select("id, status")
    .eq("id", payload.requestId)
    .eq("org_id", orgId)
    .single()

  if (reqErr || !req) return { error: "Reschedule request not found" }
  if (req.status !== "pending") return { error: "Request has already been resolved" }

  const { error } = await db
    .from("inspection_reschedule_requests")
    .update({
      status: payload.action,
      agent_response: payload.agentResponse,
      resolved_date: payload.resolvedDate,
      resolved_by: userId,
    })
    .eq("id", payload.requestId)
    .eq("org_id", orgId)

  if (error) {
    console.error("respondToRescheduleRequest failed:", error.message)
    return { error: "Could not save response. Please try again." }
  }

  // If approved or countered, update the inspection's scheduled_date
  if ((payload.action === "approved" || payload.action === "countered") && payload.resolvedDate) {
    await db
      .from("inspections")
      .update({ scheduled_date: payload.resolvedDate })
      .eq("id", payload.inspectionId)
      .eq("org_id", orgId)
  }

  await db.from("audit_log").insert({
    org_id: orgId,
    table_name: "inspection_reschedule_requests",
    record_id: payload.requestId,
    action: "UPDATE",
    changed_by: userId,
    new_values: { action: `reschedule_${payload.action}`, inspection_id: payload.inspectionId },
  })

  return { success: true }
}
