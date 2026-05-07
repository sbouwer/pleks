"use server"

/**
 * lib/actions/surrendered-comms.ts — mark surrendered mandatory comm as manually dispatched
 *
 * Auth:   gateway (agent session)
 * Data:   mandatory_comm_retries, communication_log via gateway db
 * Notes:  Inserts a manual_fallback communication_log row for audit continuity, then
 *         stamps mandatory_comm_retries.manually_dispatched_at. BUILD_63 Phase 8.
 */

import { requireAgentWriteAccess } from "@/lib/auth/server"

export async function markManuallyDispatched(
  retryId: string,
  notes: string,
): Promise<{ success: boolean; error?: string }> {
  const gw = await requireAgentWriteAccess("send_manual_comm")
  const { db, userId, orgId } = gw

  // Fetch the retry row to verify ownership and get the original log ID
  const { data: retry, error: fetchError } = await db
    .from("mandatory_comm_retries")
    .select("id, org_id, communication_log_id, template_key, surrendered_at, manually_dispatched_at, recipient_snapshot")
    .eq("id", retryId)
    .eq("org_id", orgId)
    .single()

  if (fetchError || !retry) return { error: "Retry record not found", success: false }
  if (!retry.surrendered_at) return { error: "Comm has not been surrendered", success: false }
  if (retry.manually_dispatched_at) return { error: "Already marked as dispatched", success: false }

  const snapshot = retry.recipient_snapshot as { email?: string; phone?: string } | null
  const now = new Date().toISOString()

  // Write manual_fallback audit row to communication_log
  const { error: logError } = await db.from("communication_log").insert({
    org_id:              orgId,
    direction:           "outbound",
    channel:             "email",
    template_key:        retry.template_key,
    subject:             `Manual dispatch — ${retry.template_key}`,
    body:                notes || "Dispatched manually by agent (printed and delivered physically)",
    status:              "logged",
    sent_to_email:       snapshot?.email ?? null,
    trigger_event_type:  "manual_fallback",
    first_attempt_log_id: retry.communication_log_id,
    triggered_by:        userId,
  })

  if (logError) {
    console.error("[markManuallyDispatched] log insert failed:", logError.message)
    return { error: logError.message, success: false }
  }

  // Stamp the retry row
  const { error: updateError } = await db
    .from("mandatory_comm_retries")
    .update({
      manually_dispatched_at: now,
      dispatch_notes:         notes || null,
      dispatched_by:          userId,
    })
    .eq("id", retryId)
    .eq("org_id", orgId)

  if (updateError) {
    console.error("[markManuallyDispatched] update failed:", updateError.message)
    return { error: updateError.message, success: false }
  }

  return { success: true }
}
