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

  // Validate token matches co-applicant and is unexpired
  const { data: coApp, error } = await service
    .from("application_co_applicants")
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
    const { data: verif } = await service
      .from("consent_verifications")
      .select("status, consent_type, target_phone_e164, code_verified_at")
      .eq("id", verificationId)
      .single()

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
    await service
      .from("consent_verifications")
      .update({ consent_log_id: logEntry.id })
      .eq("id", verificationId)
  }

  return NextResponse.json({ ok: true })
}
