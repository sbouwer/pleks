/**
 * app/api/applications/co-applicant/[token]/screening-consent/route.ts — a residential co-applicant's stage-2 consent
 *
 * Route:  POST /api/applications/co-applicant/[token]/screening-consent
 * Auth:   application_co_applicants.access_token (the party's private link = the ownership proof)
 * Data:   application_co_applicants — stage2_consent_given(_at) / stage2_consent_ip / stage2_consent_log_id;
 *         consent_log (lib/screening/screeningConsent.ts); consent_verifications — links the verified SMS round
 * Notes:  BUILD_72 P1-R8. Stage 2 is consent to a credit-bureau enquiry on THIS data subject (POPIA s11, BUILD_69 P3):
 *         the lead cannot give it for them and a stage-1 sign-off never substitutes for it. Same applicant consent
 *         text, version and consent_log shape as the lead's invite-consent (R8b-3); the party-row writes mirror
 *         director-consent, which stays the juristic surety's path.
 *         Only after the stage-2 invite (stage2_invited_at, written at shortlist — R8b-2): before it there is no
 *         consent to give, and the window the reminder cron runs has not started.
 *         The verification is bound to THIS party's own round (director_token = this access_token), not merely to
 *         the application: the lead's round on the same application is not this person's evidence.
 *         ADDENDUM_14W §0: no late-party refusal — this party pays their own line after consenting.
 */
import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { rateLimit, getClientIp } from "@/lib/security/rateLimit"
import { insertScreeningConsentLog } from "@/lib/screening/screeningConsent"
import { inviteRoute } from "@/lib/applications/juristicParties"

interface Props { params: Promise<{ token: string }> }

export async function POST(req: NextRequest, { params }: Props) {
  if (!rateLimit(`co-screening-consent:${getClientIp(req)}`, { limit: 20, windowMs: 60_000 })) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 })
  }
  const { token } = await params
  const { verificationId } = await req.json().catch(() => ({})) as { verificationId?: string | null }
  if (!token) return NextResponse.json({ error: "Missing token" }, { status: 400 })

  const service = await createServiceClient()

  // THIS READ IS THE OWNERSHIP PROOF for the handler — the access_token is the credential and the org is a RESULT
  // of the read, never an input to it (same exit as director-consent).
  const { data: coApp, error } = await service
    .from("application_co_applicants")
    // org scope (a [token] path, outside the scope rules' aperture): bounded by the party's private access_token; org is derived from this row, not asserted against it
    .select("id, org_id, primary_application_id, applicant_email, stage2_invited_at, stage2_consent_given_at, access_token_expires, stage1_consent_given, role, is_surety_director, declared_director")
    .eq("access_token", token)
    .is("declined_at", null)
    .maybeSingle()
  logQueryError("POST co screening-consent application_co_applicants", error)

  if (error || !coApp) {
    return NextResponse.json({ error: "Invalid or expired link" }, { status: 403 })
  }
  if (coApp.access_token_expires && new Date(coApp.access_token_expires as string) < new Date()) {
    return NextResponse.json({ error: "Link expired" }, { status: 410 })
  }
  if (coApp.stage2_consent_given_at) {
    return NextResponse.json({ ok: true, alreadyConsented: true })
  }
  if (!coApp.stage2_invited_at || coApp.stage1_consent_given !== true) {
    // No stage 2 before the invite, and none for a party with no stage-1 details on file — the runner would then
    // hold a consent it cannot act on (walker F12, 72-p1-r8; the page gates the same way).
    return NextResponse.json({ error: "Screening consent has not been requested yet" }, { status: 409 })
  }

  // This surface carries the RESIDENTIAL applicant text. A juristic surety consents on the director path, and a held
  // one has no reviewed text at all — the same inviteRoute answer the shortlist and every sender read (walker F2).
  const { data: application, error: appErr } = await service
    .from("applications")
    .select("entity_type, applicant_type, company_info")
    .eq("id", coApp.primary_application_id as string)
    .eq("org_id", coApp.org_id as string)
    .maybeSingle()
  logQueryError("POST co screening-consent applications", appErr)
  if (appErr || !application) {
    return NextResponse.json({ error: "Invalid or expired link" }, { status: 403 })
  }
  if (inviteRoute({ party: coApp, application }) !== "co_applicant") {
    return NextResponse.json({ error: "Screening consent has not been requested yet" }, { status: 409 })
  }

  if (verificationId) {
    // ⚠ BOTH filters are the security boundary (see director-consent for the provenance-forgery narrative): the
    // round must be on this application AND this party's own — send-code stores the co token in director_token.
    const { data: verif, error: verifError } = await service
      .from("consent_verifications")
      // org scope (a [token] path, outside the scope rules' aperture): bound to the party whose access_token proved ownership above; consent_verifications.org_id is nullable and cannot carry this
      .select("status")
      .eq("id", verificationId)
      .eq("application_id", coApp.primary_application_id)
      .eq("director_token", token)
      .eq("consent_type", "co_applicant_standard")
      .maybeSingle()
    logQueryError("POST co screening-consent consent_verifications", verifError)
    if (verif?.status !== "verified") {
      return NextResponse.json({ error: "SMS verification not confirmed" }, { status: 403 })
    }
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null
  const logEntry = await insertScreeningConsentLog(service, {
    orgId:          coApp.org_id as string,
    subjectEmail:   coApp.applicant_email as string | null,
    applicationId:  coApp.primary_application_id as string,
    coApplicantId:  coApp.id as string,
    ip,
    userAgent:      req.headers.get("user-agent"),
    verificationId: verificationId ?? null,
  })
  if (!logEntry.ok) {
    console.error("[co screening-consent] consent_log insert failed:", logEntry.error)
    return NextResponse.json({ error: "Failed to record consent" }, { status: 500 })
  }

  const { error: updateErr } = await service
    .from("application_co_applicants")
    .update({
      stage2_consent_given:    true,
      stage2_consent_given_at: new Date().toISOString(),
      stage2_consent_ip:       ip,
      stage2_consent_log_id:   logEntry.id,
    })
    .eq("id", coApp.id as string)
    .eq("org_id", coApp.org_id as string)
  if (updateErr) {
    console.error("[co screening-consent] update failed:", updateErr.message)
    return NextResponse.json({ error: "Failed to record consent" }, { status: 500 })
  }

  if (verificationId) {
    const { error: linkErr } = await service
      .from("consent_verifications")
      // org scope (a [token] path, outside the scope rules' aperture): bound by application_id + director_token below to the party the access_token proved; consent_verifications.org_id is nullable and cannot carry this
      .update({ consent_log_id: logEntry.id })
      .eq("id", verificationId)
      .eq("application_id", coApp.primary_application_id)
      .eq("director_token", token)
    logQueryError("POST co screening-consent link verification", linkErr)
  }

  return NextResponse.json({ ok: true })
}
