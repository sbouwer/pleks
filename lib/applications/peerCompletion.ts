/**
 * lib/applications/peerCompletion.ts — fire the all-green "ready to submit" fan-out ONCE (ADDENDUM_14R Phase 4).
 *
 * Called after a section sign-off (the lead's save-draft consent, or a co's final save). If that write made EVERY
 * peer green on a JOINT application, email all applicants "ready to submit" — exactly once. The fan-out is armed off
 * applications.all_complete_notified_at: a conditional update claims the notify (null → now), so only ONE writer
 * fires even if finishers race. Unlike a communication_log dedup, the column is RE-ARMABLE — a roster change nulls
 * it (the co-add route does, on invite), so a group that goes all-green AGAIN re-fires. (Decline-induced all-green
 * firing — a pending co declines, completing the group — is a queued follow-on: the decline sites would call
 * maybeFireAllGreen.)
 *
 * Returns whether the application is now all-green — the caller routes the finisher straight to the review on true
 * (14R last-to-complete). Solo applications (no cos) return false: their normal hub→review flow already covers it.
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { incompleteApplicantCount } from "./submitGate"
import { notifyAllReadyToSubmit } from "./peerEmails"
import { logQueryError } from "@/lib/supabase/logQueryError"

export async function maybeFireAllGreen(service: SupabaseClient, applicationId: string): Promise<boolean> {
  const { data: app, error: appErr } = await service
    .from("applications").select("stage1_consent_given").eq("id", applicationId).maybeSingle()
  logQueryError("peerCompletion app", appErr)
  if (!app) return false

  const { data: cos, error: cosErr } = await service
    .from("application_co_applicants").select("stage1_consent_given").eq("primary_application_id", applicationId).is("declined_at", null)
  logQueryError("peerCompletion cos", cosErr)
  const coList = cos ?? []
  if (coList.length === 0) return false // solo application — no joint fan-out / last-to-complete routing

  const incomplete = incompleteApplicantCount(app.stage1_consent_given === true, coList.map((c) => c.stage1_consent_given === true))
  if (incomplete > 0) return false

  // All green. Arm the fan-out atomically: the conditional update flips all_complete_notified_at null → now and
  // returns the row only for the WINNER, so concurrent finishers can't double-send. A roster change re-arms it.
  const { data: armed, error: armErr } = await service
    .from("applications").update({ all_complete_notified_at: new Date().toISOString() })
    .eq("id", applicationId).is("all_complete_notified_at", null).select("id")
  logQueryError("peerCompletion arm", armErr)
  if (armed && armed.length > 0) await notifyAllReadyToSubmit(service, applicationId)
  return true
}
