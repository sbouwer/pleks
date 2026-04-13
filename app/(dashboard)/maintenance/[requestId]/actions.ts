"use server"

import { gateway } from "@/lib/supabase/gateway"

interface RecordDelayPayload {
  requestId: string
  delayType: string
  originalDate: string | null
  rescheduledTo: string | null
  note: string | null
}

const VALID_DELAY_TYPES = [
  "tenant_not_available", "tenant_rescheduled", "tenant_no_response", "tenant_denied_access",
  "contractor_no_show", "contractor_rescheduled", "contractor_no_response", "contractor_returned_incomplete",
  "agent_pending_approval", "agent_pending_quote_review", "agent_pending_landlord_approval",
  "parts_on_order", "weather", "access_issue_other",
]

const ATTRIBUTION: Record<string, string> = {
  tenant_not_available: "tenant", tenant_rescheduled: "tenant",
  tenant_no_response: "tenant", tenant_denied_access: "tenant",
  contractor_no_show: "contractor", contractor_rescheduled: "contractor",
  contractor_no_response: "contractor", contractor_returned_incomplete: "contractor",
  agent_pending_approval: "agent", agent_pending_quote_review: "agent",
  agent_pending_landlord_approval: "agent",
  parts_on_order: "external", weather: "external", access_issue_other: "external",
}

export async function recordMaintenanceDelay(payload: RecordDelayPayload) {
  const gw = await gateway()
  if (!gw) return { error: "Not authenticated" }

  const { db, orgId, userId } = gw

  if (!VALID_DELAY_TYPES.includes(payload.delayType)) {
    return { error: "Invalid delay type" }
  }

  // Verify the maintenance request belongs to this org
  const { data: req, error: reqErr } = await db
    .from("maintenance_requests")
    .select("id")
    .eq("id", payload.requestId)
    .eq("org_id", orgId)
    .single()

  if (reqErr || !req) return { error: "Maintenance request not found" }

  const { data: event, error } = await db
    .from("maintenance_delay_events")
    .insert({
      org_id: orgId,
      maintenance_id: payload.requestId,
      delay_type: payload.delayType,
      attributed_to: ATTRIBUTION[payload.delayType] ?? "external",
      original_date: payload.originalDate ?? null,
      rescheduled_to: payload.rescheduledTo ?? null,
      note: payload.note ?? null,
      recorded_by: userId,
    })
    .select("id, delay_type, attributed_to, occurred_at, original_date, rescheduled_to, note")
    .single()

  if (error || !event) {
    console.error("recordMaintenanceDelay failed:", error?.message)
    return { error: "Could not record delay. Please try again." }
  }

  return { success: true, event }
}
