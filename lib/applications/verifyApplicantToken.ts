/**
 * lib/applications/verifyApplicantToken.ts — validate an applicant credential is bound to an application
 *
 * Auth:   the credential IS the auth (token-as-proof, 14R peer model) — used by the applicant-facing
 *         apply routes (detect-document, documents, upload-url, remove) to gate work on an id.
 * Data:   application_tokens (the lead's token) + application_co_applicants.access_token (a co's token).
 * Notes:  IDOR-safe — the token must be bound to THIS applicationId (not any application), and unexpired /
 *         not declined. Accepts EITHER the lead token or a co-applicant access token (any peer may act).
 *         `resolveApplicantToken` also says WHICH subject the token is, so a storage path can be bound to that
 *         subject's own folder (pathBelongsToSubject), and carries that subject's recorded stage-1 consent —
 *         the gate on sending any of its documents to a processor (DECISIONS 2026-10-03).
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { logQueryError } from "@/lib/supabase/logQueryError"
import type { ApplicantSubject } from "@/lib/applications/applicationStoragePath"

export interface ResolvedApplicant {
  subject: ApplicantSubject
  /** This subject's own recorded stage-1 consent — the lead's on applications, a co's on its own row. */
  stage1ConsentGiven: boolean
}

export async function resolveApplicantToken(
  db: SupabaseClient,
  token: string | null | undefined,
  applicationId: string,
): Promise<ResolvedApplicant | null> {
  if (!token) return null

  // Lead credential — application_tokens, bound to this id, unexpired.
  const { data: lead, error: leadErr } = await db
    .from("application_tokens")
    .select("application_id, applications(stage1_consent_given)")
    .eq("token", token)
    .eq("application_id", applicationId)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle()
  logQueryError("resolveApplicantToken application_tokens", leadErr)
  if (lead) {
    const app = (lead as { applications?: { stage1_consent_given?: boolean | null } | null }).applications
    return { subject: { kind: "lead" }, stage1ConsentGiven: app?.stage1_consent_given === true }
  }

  // Co-applicant credential — access_token bound to this primary application, not declined.
  const { data: co, error: coErr } = await db
    .from("application_co_applicants")
    .select("id, stage1_consent_given")
    .eq("access_token", token)
    .eq("primary_application_id", applicationId)
    .is("declined_at", null)
    .maybeSingle()
  logQueryError("resolveApplicantToken application_co_applicants", coErr)
  if (!co) return null
  return { subject: { kind: "co", coId: co.id as string }, stage1ConsentGiven: co.stage1_consent_given === true }
}

export async function verifyApplicantToken(
  db: SupabaseClient,
  token: string | null | undefined,
  applicationId: string,
): Promise<boolean> {
  return (await resolveApplicantToken(db, token, applicationId)) !== null
}
