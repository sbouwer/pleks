/**
 * app/api/applications/director-consent/route.ts — Records explicit POPIA consent for a surety director
 *
 * Route:  POST /api/applications/director-consent
 * Auth:   application_co_applicants.access_token (director's private token)
 * Data:   application_co_applicants — sets stage2_consent_given_at + consent_ip + consent_log_id
 *         consent_verifications — links verified SMS round to consent_log row (ADDENDUM_14F)
 * Notes:  D-14B-01: directors must consent individually. ADDENDUM_14F: verificationId is optional
 *         (null when director has no phone). When present, verified status is re-checked server-side.
 */
import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { logQueryError } from "@/lib/supabase/logQueryError"

export async function POST(req: NextRequest) {
  const { coApplicantId, token, verificationId } = await req.json() as {
    coApplicantId?: string
    token?: string
    verificationId?: string | null
  }

  if (!coApplicantId || !token) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 })
  }

  const service = await createServiceClient()

  // Validate token matches co-applicant and is unexpired.
  // THIS READ IS THE OWNERSHIP PROOF the rest of the handler leans on — it is the "prove ownership
  // first" exit the rule names, with `access_token` as the proof rather than `org_id`. The route is
  // reached by an unauthenticated director holding a private token; there is no caller org to scope
  // to, and `coApp.org_id` is a RESULT of this read, not an input to it.
  const { data: coApp, error } = await service
    .from("application_co_applicants")
    // eslint-disable-next-line pleks/require-org-scope-on-service-read -- bounded by the director's private access_token; org is derived from this row, not asserted against it
    .select("id, org_id, primary_application_id, applicant_email, stage2_consent_given_at, access_token_expires, declined_at")
    .eq("id", coApplicantId)
    .eq("access_token", token)
    .is("declined_at", null)
    .single()

  if (error || !coApp) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 403 })
  }

  if (coApp.access_token_expires && new Date(coApp.access_token_expires) < new Date()) {
    return NextResponse.json({ error: "Token expired" }, { status: 410 })
  }

  if (coApp.stage2_consent_given_at) {
    return NextResponse.json({ ok: true, alreadyConsented: true })
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null
  const now = new Date().toISOString()

  // Re-verify the SMS verification server-side if provided (ADDENDUM_14F)
  let verificationMethod = "none"
  if (verificationId) {
    // ⚠ `.eq("application_id", …)` IS THE SECURITY BOUNDARY, not a filter. `verificationId` is
    //   caller-supplied and the token above proves ownership of THIS co-applicant, not of an
    //   arbitrary verification row. Bound only by `status === "verified"`, any verified row on the
    //   platform satisfied the check — so a caller could stamp `verification_method: "sms_code"` on
    //   their own consent_log using someone else's SMS round, in another org. That forges the
    //   provenance of a POPIA s11(1)(a) record: the consent still exists, but the evidence that it
    //   was verified is another person's.
    //   Bound on `application_id`, NOT `org_id`: send-code populates application_id from a
    //   non-nullable string on every insert path, while its orgId is `string | null`, so an org
    //   filter would fail closed on legitimate rows.
    // Selecting `status` alone — consent_type, code_verified_at and target_phone_e164 were read and
    // never used. The last is a phone number, so this is data minimisation, not tidying.
    const { data: verif, error: verifError } = await service
      .from("consent_verifications")
      // eslint-disable-next-line pleks/require-org-scope-on-service-read -- bound to the application the verified access_token above proves ownership of; consent_verifications.org_id is nullable and cannot carry this
      .select("status")
      .eq("id", verificationId)
      .eq("application_id", coApp.primary_application_id)
      .single()
    logQueryError("POST consent_verifications", verifError)

    if (verif?.status !== "verified") {
      return NextResponse.json({ error: "SMS verification not confirmed" }, { status: 403 })
    }
    verificationMethod = "sms_code"
  }

  // Insert consent_log entry — POPIA s11(1)(a) hard audit requirement
  const { data: logEntry, error: logErr } = await service
    .from("consent_log")
    .insert({
      org_id:               coApp.org_id,
      subject_email:        coApp.applicant_email,
      consent_type:         "credit_check",
      consent_given:        true,
      consent_version:      "1.0",
      ip_address:           ip,
      user_agent:           req.headers.get("user-agent"),
      verification_method:  verificationMethod,
      verification_id:      verificationId ?? null,
      verification_status:  verificationId ? "verified" : "not_required",
      metadata:             {
        purpose:                     "credit_check_director_surety",
        application_co_applicant_id: coApplicantId,
        application_id:              coApp.primary_application_id,
      },
    })
    .select("id")
    .single()

  if (logErr) {
    console.error("[director-consent] consent_log insert failed:", logErr.message)
    return NextResponse.json({ error: "Failed to record consent" }, { status: 500 })
  }

  const { error: updateErr } = await service
    .from("application_co_applicants")
    // eslint-disable-next-line pleks/require-org-scope-on-service-write -- targets the co-applicant row the access_token at the top of this handler proved ownership of; public director flow, no caller org
    .update({
      stage2_consent_given:    true,
      stage2_consent_given_at: now,
      stage2_consent_ip:       ip,
      stage2_consent_log_id:   logEntry?.id ?? null,
    })
    .eq("id", coApplicantId)

  if (updateErr) {
    console.error("[director-consent] update failed:", updateErr.message)
    return NextResponse.json({ error: "Failed to record consent" }, { status: 500 })
  }

  // F5: link verification row back to consent_log (mirrors invite-consent pattern)
  if (verificationId && logEntry?.id) {
    // Same boundary on the write half — unbound, this overwrote the VICTIM row's consent_log_id.
    // The WRITE rule was blind to this surface until R2 aligned the two skip sets: it listed
    // `applications` and the READ rule did not, so this file was checked for reads and not for
    // writes. That asymmetry is what let the defect land; it is closed, and this now fires.
    await service
      .from("consent_verifications")
      // eslint-disable-next-line pleks/require-org-scope-on-service-write -- bound by .eq("application_id", …) below to the application the access_token proved; consent_verifications.org_id is nullable and cannot carry this
      .update({ consent_log_id: logEntry.id })
      .eq("id", verificationId)
      .eq("application_id", coApp.primary_application_id)
  }

  return NextResponse.json({ ok: true })
}
