/**
 * lib/applications/peerCompletion.ts — fire the all-green "ready to submit" fan-out ONCE (ADDENDUM_14R Phase 4).
 *
 * Called after a section sign-off (the lead's save-draft consent, or a co's final save). If that write made EVERY
 * peer green on a JOINT application, email all applicants "ready to submit" — exactly once. Idempotency rides on
 * communication_log (sendEmail already logs there with template_key + entity_id), so NO new column: if
 * application.all_complete was already logged for this application we skip the re-send. Only ONE write ever
 * transitions the group to all-green (the last completer), so the dedup is just a retry backstop.
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

  // All green. Fire the "ready to submit" fan-out once — dedup off communication_log (the send logs there).
  const { data: prior, error: priorErr } = await service
    .from("communication_log").select("id")
    .eq("entity_type", "application").eq("entity_id", applicationId).eq("template_key", "application.all_complete")
    .limit(1).maybeSingle()
  logQueryError("peerCompletion prior notify", priorErr)
  if (!prior) await notifyAllReadyToSubmit(service, applicationId)
  return true
}
