/**
 * app/api/applications/invite-consent/route.ts — Records Stage 2 POPIA consent for invited applicants
 *
 * Route:  POST /api/applications/invite-consent
 * Auth:   application_tokens.token lookup (service client)
 * Data:   applications (stage2_consent_given_at), consent_log, consent_verifications
 * Notes:  ADDENDUM_14F. Replaces direct anon Supabase writes in the client consent page.
 *         verificationId is optional (null if applicant has no phone on file).
 *         When present, verification status is re-checked server-side before consent is recorded.
 */
import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"

export async function POST(req: NextRequest) {
  const { token, verificationId } = await req.json() as {
    token?: string
    verificationId?: string | null
  }

  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 })
  }

  const service = await createServiceClient()

  // F6: check expires_at (consistent with send-code applicant path)
  const { data: tokenRow } = await service
    .from("application_tokens")
    .select("application_id, applicant_email")
    .eq("token", token)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle()

  if (!tokenRow) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 403 })
  }

  const { data: app } = await service
    .from("applications")
    .select("org_id, stage2_consent_given")
    .eq("id", tokenRow.application_id)
    .single()

  if (!app) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 })
  }

  if (app.stage2_consent_given) {
    return NextResponse.json({ ok: true, alreadyConsented: true })
  }

  // Re-verify SMS verification server-side if provided (ADDENDUM_14F)
  let verificationMethod = "none"
  if (verificationId) {
    const { data: verif } = await service
      .from("consent_verifications")
      .select("status")
      .eq("id", verificationId)
      .single()

    if (verif?.status !== "verified") {
      return NextResponse.json({ error: "SMS verification not confirmed" }, { status: 403 })
    }
    verificationMethod = "sms_code"
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null
  const now = new Date().toISOString()

  const { data: logEntry, error: logErr } = await service
    .from("consent_log")
    .insert({
      org_id:              app.org_id,
      subject_email:       tokenRow.applicant_email,
      consent_type:        "credit_check",
      consent_given:       true,
      consent_version:     "1.0-searchworx-stage2",
      ip_address:          ip,
      user_agent:          req.headers.get("user-agent"),
      verification_method: verificationMethod,
      verification_id:     verificationId ?? null,
      verification_status: verificationId ? "verified" : "not_required",
      metadata:            {
        application_id: tokenRow.application_id,
        bureau:         "searchworx",
        check_types:    ["transunion", "xds", "csi_id", "csi_id_photo", "tpn_adverse"],
        stage:          2,
      },
    })
    .select("id")
    .single()

  if (logErr) {
    console.error("[invite-consent] consent_log insert failed:", logErr.message)
    return NextResponse.json({ error: "Failed to record consent" }, { status: 500 })
  }

  // Link verification row back to consent_log
  if (verificationId) {
    await service
      .from("consent_verifications")
      .update({ consent_log_id: logEntry?.id })
      .eq("id", verificationId)
  }

  const { error: updateErr } = await service
    .from("applications")
    .update({
      stage2_consent_given:    true,
      stage2_consent_given_at: now,
      stage2_status:           "pending_payment",
    })
    .eq("id", tokenRow.application_id)

  if (updateErr) {
    console.error("[invite-consent] application update failed:", updateErr.message)
    return NextResponse.json({ error: "Failed to update application" }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
