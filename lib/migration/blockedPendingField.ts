/**
 * lib/migration/blockedPendingField.ts — the automated-action fail-closed contract (ADDENDUM_21E §3A-safety)
 *
 * Notes:  An automated / cron action has no human to prompt, so when it hits a missing required field it must
 *         DEGRADE, not fire broken. `recordBlockedPendingField` writes a durable, queryable BLOCKED state (one
 *         open row per org+action+subject) that surfaces on the completeness metric (§6). The action then does NOT
 *         fire (send-to-nowhere / defective notice) and does NOT silently advance (vanished-action) — it waits.
 *         When the field is later filled and the action succeeds, `resolveBlockedPendingField` clears the block.
 *
 *         3A-ergonomics — the dedicated worked queue an agent clears the row from — is ADDENDUM_70J. This module
 *         is the SAFETY half: never fires wrong, never vanishes, always discoverable.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

interface BlockParams {
  orgId: string
  action: string // e.g. "arrears_comm"
  subjectType: string // e.g. "tenant"
  subjectId: string
  missingFields: string[] // >= 1 needed for the action to proceed
}

/** Record (or refresh) the open block for this action+subject. Idempotent — a re-running cron never piles rows. */
export async function recordBlockedPendingField(db: SupabaseClient, p: BlockParams): Promise<void> {
  const { data: existing, error: selErr } = await db
    .from("blocked_pending_field").select("id")
    .eq("org_id", p.orgId).eq("action", p.action).eq("subject_id", p.subjectId).is("resolved_at", null)
    .limit(1).maybeSingle()
  if (selErr) { console.error("recordBlockedPendingField lookup failed:", selErr.message); return }

  if (existing) {
    const { error } = await db.from("blocked_pending_field").update({ missing_fields: p.missingFields }).eq("id", existing.id)
    if (error) console.error("recordBlockedPendingField update failed:", error.message)
    return
  }
  const { error } = await db.from("blocked_pending_field").insert({
    org_id: p.orgId, action: p.action, subject_type: p.subjectType, subject_id: p.subjectId, missing_fields: p.missingFields,
  })
  if (error) console.error("recordBlockedPendingField insert failed:", error.message)
}

/** Clear any open block for this action+subject — call when the action finally succeeds (the field got filled). */
export async function resolveBlockedPendingField(
  db: SupabaseClient, p: { orgId: string; action: string; subjectId: string },
): Promise<void> {
  const { error } = await db.from("blocked_pending_field")
    .update({ resolved_at: new Date().toISOString() })
    .eq("org_id", p.orgId).eq("action", p.action).eq("subject_id", p.subjectId).is("resolved_at", null)
  if (error) console.error("resolveBlockedPendingField failed:", error.message)
}
