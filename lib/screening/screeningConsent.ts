/**
 * lib/screening/screeningConsent.ts — the applicant stage-2 screening consent: one version, one consent_log shape
 *
 * Auth:   service-role db — callers have already proved ownership by token (invite token or co access_token).
 * Data:   consent_log (insert)
 * Notes:  BUILD_72 P1-R8b-3. The lead (`invite-consent`) and every residential co-applicant / guarantor
 *         (`co-applicant/screening-consent`) sign the SAME counsel-reviewed applicant screening consent — rendered by
 *         components/consent/ScreeningConsentForm.tsx — so they log the same version and the same shape here. A
 *         co row's log adds only the party row it belongs to. The surety-director path (director-consent, version
 *         "1.0") is deliberately NOT routed through this until counsel rules on its copy.
 *         Bumping SCREENING_CONSENT_VERSION is a counsel event (70H), never an engineering one: the version is
 *         the evidence of WHICH text the subject agreed to.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

/** The version string of the applicant screening consent text. Unchanged from the inline value it replaced. */
const SCREENING_CONSENT_VERSION = "1.0-searchworx-stage2"

/** The checks that text authorises, as logged. Order and values unchanged from the inline literal. */
const SCREENING_CONSENT_CHECK_TYPES = ["transunion", "xds", "csi_id", "csi_id_photo", "tpn_adverse"] as const

export interface ScreeningConsentLogInput {
  orgId: string
  subjectEmail: string | null
  applicationId: string
  /** Set for a co-applicant / guarantor — the party row the consent belongs to. Absent for the lead. */
  coApplicantId?: string
  ip: string | null
  userAgent: string | null
  /** A verified SMS round already bound to this subject by the caller, or null when there is no phone on file. */
  verificationId: string | null
}

/** Write the POPIA s11(1)(a) consent_log row for one subject's screening consent. Returns its id. */
export async function insertScreeningConsentLog(
  db: SupabaseClient,
  input: ScreeningConsentLogInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { data, error } = await db
    .from("consent_log")
    .insert({
      org_id:              input.orgId,
      subject_email:       input.subjectEmail,
      consent_type:        "credit_check",
      consent_given:       true,
      consent_version:     SCREENING_CONSENT_VERSION,
      ip_address:          input.ip,
      user_agent:          input.userAgent,
      verification_method: input.verificationId ? "sms_code" : "none",
      verification_id:     input.verificationId,
      verification_status: input.verificationId ? "verified" : "not_required",
      metadata:            {
        application_id: input.applicationId,
        ...(input.coApplicantId ? { application_co_applicant_id: input.coApplicantId } : {}),
        bureau:         "searchworx",
        check_types:    [...SCREENING_CONSENT_CHECK_TYPES],
        stage:          2,
      },
    })
    .select("id")
    .single()
  if (error || !data) return { ok: false, error: error?.message ?? "no row returned" }
  return { ok: true, id: data.id as string }
}
