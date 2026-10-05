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
 *         14X P5: the group block (lib/screening/consentWording.ts) is recorded as `group_clause_shown` in metadata —
 *         the gate for that subject's N6 result link. Same version (approved-comms §4: "same consent version for every
 *         party"); the flag says which text the subject saw. It is TRUE only when the form says it showed the block AND
 *         the application is a group one when the consent is written — recomputed here, never taken from the client
 *         alone, so a stale or forged claim can only under-record, which withholds the link (fails closed).
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
  /** What the form reports it rendered: the group block (paragraph + completion-status sentence). */
  groupClauseShown: boolean
}

/**
 * Whether the application has more than one party now: the lead plus at least one co party not declined (14X P5, D4).
 * A declined party has left the set, as it has for the roster and the orchestrator.
 */
export async function isGroupApplication(db: SupabaseClient, orgId: string, applicationId: string): Promise<boolean> {
  const { count, error } = await db
    .from("application_co_applicants")
    .select("id", { count: "exact", head: true })
    .eq("primary_application_id", applicationId)
    .eq("org_id", orgId)
    .is("declined_at", null)
  if (error) throw new Error(`group application: count co parties: ${error.message}`)
  return (count ?? 0) > 0
}

/** Write the POPIA s11(1)(a) consent_log row for one subject's screening consent. Returns its id. */
export async function insertScreeningConsentLog(
  db: SupabaseClient,
  input: ScreeningConsentLogInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  let group: boolean
  try {
    group = input.groupClauseShown && await isGroupApplication(db, input.orgId, input.applicationId)
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
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
        group_clause_shown: group,
      },
    })
    .select("id")
    .single()
  if (error || !data) return { ok: false, error: error?.message ?? "no row returned" }
  return { ok: true, id: data.id as string }
}
