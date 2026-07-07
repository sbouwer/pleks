/**
 * lib/applications/verifyApplicantToken.ts — validate an applicant credential is bound to an application
 *
 * Auth:   the credential IS the auth (token-as-proof, 14R peer model) — used by the applicant-facing
 *         apply routes (detect-document, documents, submit-to-agent, screen) to gate work on an id.
 * Data:   application_tokens (the lead's token) + application_co_applicants.access_token (a co's token).
 * Notes:  IDOR-safe — the token must be bound to THIS applicationId (not any application), and unexpired /
 *         not declined. Accepts EITHER the lead token or a co-applicant access token (any peer may act).
 */
import type { SupabaseClient } from "@supabase/supabase-js"
import { logQueryError } from "@/lib/supabase/logQueryError"

export async function verifyApplicantToken(
  db: SupabaseClient,
  token: string | null | undefined,
  applicationId: string,
): Promise<boolean> {
  if (!token) return false

  // Lead credential — application_tokens, bound to this id, unexpired.
  const { data: lead, error: leadErr } = await db
    .from("application_tokens")
    .select("application_id")
    .eq("token", token)
    .eq("application_id", applicationId)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle()
  logQueryError("verifyApplicantToken application_tokens", leadErr)
  if (lead) return true

  // Co-applicant credential — access_token bound to this primary application, not declined.
  const { data: co, error: coErr } = await db
    .from("application_co_applicants")
    .select("id")
    .eq("access_token", token)
    .eq("primary_application_id", applicationId)
    .is("declined_at", null)
    .maybeSingle()
  logQueryError("verifyApplicantToken application_co_applicants", coErr)
  return !!co
}
