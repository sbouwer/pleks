/**
 * app/api/applications/director-consent/route.ts — Records explicit POPIA consent for a surety director
 *
 * Route:  POST /api/applications/director-consent
 * Auth:   application_co_applicants.access_token (director's private token)
 * Data:   application_co_applicants — sets stage2_consent_given_at + consent_ip + consent_log_id
 * Notes:  D-14B-01: directors must consent individually. This endpoint is the point of record
 *         for POPIA s11(1)(a) explicit consent. IP captured for audit trail.
 */
import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"

export async function POST(req: NextRequest) {
  const { coApplicantId, token } = await req.json() as { coApplicantId?: string; token?: string }

  if (!coApplicantId || !token) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 })
  }

  const service = await createServiceClient()

  // Validate token matches co-applicant and is unexpired
  const { data: coApp, error } = await service
    .from("application_co_applicants")
    .select("id, org_id, primary_application_id, stage2_consent_given_at, access_token_expires, declined_at")
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

  // Insert consent_log entry
  const { data: logEntry } = await service
    .from("consent_log")
    .insert({
      org_id:      coApp.org_id,
      action:      "consent_given",
      purpose:     "credit_check_director_surety",
      entity_type: "application_co_applicant",
      entity_id:   coApplicantId,
      ip_address:  ip,
      captured_at: now,
    })
    .select("id")
    .single()

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

  return NextResponse.json({ ok: true })
}
