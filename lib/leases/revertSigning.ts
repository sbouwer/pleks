/**
 * lib/leases/revertSigning.ts — return an out-for-signing lease to draft (D1)
 *
 * Auth:   caller passes a service-role client (webhook / cron — both bypass RLS, org-scoped on the write)
 * Data:   leases (status → draft, clears signing fields), lease_lifecycle_events
 * Notes:  A lease sent for signing sits in 'pending_signing'. If the signer declines, the DocuSeal submission
 *         expires, or it times out unsigned, it must NOT strand there — it returns to 'draft' so the agent can
 *         edit + re-send (sendForSigning requires 'draft'). Idempotent + race-safe: the update is guarded on
 *         status = 'pending_signing', so a concurrent completion (→ active) or a duplicate event is a no-op.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

export type SigningRevertReason = "declined" | "expired"
type TriggeredBy = "tenant" | "system" | "cron"

/**
 * Move a lease from 'pending_signing' back to 'draft', clearing the signing timestamps + DocuSeal submission id
 * (clean slate for a re-send), and record a lifecycle event. Returns true if it reverted this lease, false if it
 * was already resolved (signed/cancelled/reverted) or the write failed.
 */
export async function revertPendingSigningToDraft(
  db: SupabaseClient,
  lease: Readonly<{ id: string; org_id: string; status: string }>,
  reason: SigningRevertReason,
  triggeredBy: TriggeredBy,
): Promise<boolean> {
  if (lease.status !== "pending_signing") return false // already signed / cancelled / reverted — nothing to do

  const { data: updated, error } = await db
    .from("leases")
    .update({
      status: "draft",
      sent_for_signing_at: null,
      sign_reminder_sent_at: null,
      docuseal_submission_id: null,
    })
    .eq("id", lease.id)
    .eq("org_id", lease.org_id)
    .eq("status", "pending_signing") // race guard: lose to a concurrent completion → 0 rows, no-op
    .select("id")
  if (error) {
    console.error("[revertSigning] lease update failed:", error.message)
    return false
  }
  if (!updated || updated.length === 0) return false // another path resolved it first

  const eventType = reason === "declined" ? "lease_signing_declined" : "lease_signing_expired"
  const { error: evErr } = await db.from("lease_lifecycle_events").insert({
    org_id: lease.org_id,
    lease_id: lease.id,
    event_type: eventType,
    description:
      reason === "declined"
        ? "Signing declined via DocuSeal — lease returned to draft"
        : "Signing not completed in time — lease returned to draft",
    triggered_by: triggeredBy,
  })
  if (evErr) console.error("[revertSigning] lifecycle insert failed:", evErr.message)
  return true
}
