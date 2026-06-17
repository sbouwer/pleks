/**
 * lib/popia/applicantPurgeGate.ts — F3 declined-applicant purge gate (SPEC_LEGAL_HOLD_POLYMORPHIC §7)
 *
 * Auth:   service-role only (called from the F3 purge sweep).
 * Data:   reads legal_hold_events via isOnHold (no writes here).
 * Notes:  Returns ok:true ONLY when BOTH the application AND the subject scopes are hold-free. Subject scope
 *         uses tenants.auth_user_id (applicant ≡ tenant convention, CLAUDE.md). A NULL auth_user_id is a
 *         row-SKIP (subject_missing), never a purge-allow — never purge what cannot be hold-checked.
 *         NB: not single-txn-atomic with the destructive UPDATE; F3 is a nightly batch so the window is ms.
 *         True atomicity (hold-check inside the UPDATE txn) is a flagged follow-up, not this build.
 */
import { isOnHold } from "@/lib/legal/holds"
import type { SupabaseClient } from "@supabase/supabase-js"

export type ApplicantPurgeGateResult =
  | { ok: true; claimedAt: string }
  | { ok: false; reason: "hold_active_application" | "hold_active_subject" | "subject_missing" }

export async function claimApplicantPurgeSlot(
  db: SupabaseClient,
  args: { applicationId: string; subjectAuthUserId: string | null },
): Promise<ApplicantPurgeGateResult> {
  if (!args.subjectAuthUserId) {
    return { ok: false, reason: "subject_missing" }
  }

  if (await isOnHold(db, { scopeType: "application", scopeId: args.applicationId })) {
    return { ok: false, reason: "hold_active_application" }
  }

  if (await isOnHold(db, { scopeType: "subject", scopeId: args.subjectAuthUserId })) {
    return { ok: false, reason: "hold_active_subject" }
  }

  return { ok: true, claimedAt: new Date().toISOString() }
}
