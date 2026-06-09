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
import { gateway } from "@/lib/supabase/gateway"

/** Read the original (failed) message content for a surrendered comm, so the agent can read it before
 *  dispatching physically. Pulls subject/body from the linked communication_log row. */
export async function getSurrenderedCommContent(
  retryId: string,
): Promise<{ subject: string | null; body: string | null; channel: string | null; recipient: string | null; error?: string }> {
  const empty = { subject: null, body: null, channel: null, recipient: null }
  const gw = await gateway()
  if (!gw) return { ...empty, error: "Not authorised" }
  const { db, orgId } = gw

  const { data: retry, error } = await db
    .from("mandatory_comm_retries")
    .select("communication_log_id, recipient_snapshot")
    .eq("id", retryId)
    .eq("org_id", orgId)
    .single()
  if (error || !retry?.communication_log_id) return { ...empty, error: "Message not found" }

  const { data: log, error: logErr } = await db
    .from("communication_log")
    .select("subject, body, body_full, channel, sent_to_email")
    .eq("id", retry.communication_log_id)
    .eq("org_id", orgId)
    .single()
  if (logErr || !log) return { ...empty, error: "Message content unavailable" }

  // body is a short preview; body_full holds the rendered message the agent needs to print.
  return { subject: log.subject, body: log.body_full || log.body, channel: log.channel, recipient: log.sent_to_email }
}

/** Mark several surrendered comms dispatched in one go (used by the grouped dispatch list). Writes a
 *  manual_fallback communication_log row per comm and stamps each retry row. */
export async function markManuallyDispatchedBulk(
  retryIds: string[],
  notes: string,
): Promise<{ success: boolean; dispatched: number; error?: string }> {
  const gw = await requireAgentWriteAccess("send_manual_comm")
  const { db, userId, orgId } = gw

  const { data: retries, error } = await db
    .from("mandatory_comm_retries")
    .select("id, communication_log_id, template_key, surrendered_at, manually_dispatched_at, recipient_snapshot")
    .in("id", retryIds)
    .eq("org_id", orgId)
  if (error) return { success: false, dispatched: 0, error: error.message }

  const pending = (retries ?? []).filter((r) => r.surrendered_at && !r.manually_dispatched_at)
  if (pending.length === 0) return { success: true, dispatched: 0 }

  // One audit row per distinct original comm — retries of the same notice must not log it repeatedly.
  const seenLog = new Set<string>()
  const uniquePending = pending.filter((r) => {
    const key = r.communication_log_id ?? r.id
    if (seenLog.has(key)) return false
    seenLog.add(key)
    return true
  })

  const body = notes || "Dispatched manually by agent (printed and delivered physically)"
  const logRows = uniquePending.map((r) => ({
    org_id:               orgId,
    direction:            "outbound",
    channel:              "email",
    template_key:         r.template_key,
    subject:              `Manual dispatch — ${r.template_key}`,
    body,
    status:               "logged",
    sent_to_email:        (r.recipient_snapshot as { email?: string } | null)?.email ?? null,
    trigger_event_type:   "manual_fallback",
    first_attempt_log_id: r.communication_log_id,
    triggered_by:         userId,
  }))
  const { error: logErr } = await db.from("communication_log").insert(logRows)
  if (logErr) {
    console.error("[markManuallyDispatchedBulk] log insert failed:", logErr.message)
    return { success: false, dispatched: 0, error: logErr.message }
  }

  const { error: updErr } = await db
    .from("mandatory_comm_retries")
    .update({ manually_dispatched_at: new Date().toISOString(), dispatch_notes: notes || null, dispatched_by: userId })
    .in("id", pending.map((r) => r.id))
    .eq("org_id", orgId)
  if (updErr) {
    console.error("[markManuallyDispatchedBulk] update failed:", updErr.message)
    return { success: false, dispatched: 0, error: updErr.message }
  }

  return { success: true, dispatched: pending.length }
}

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
