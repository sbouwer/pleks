/**
 * app/api/applications/invite-consent/route.ts — Records Stage 2 POPIA consent for invited applicants
 *
 * Route:  POST /api/applications/invite-consent
 * Auth:   application_tokens.token lookup (service client)
 * Data:   applications (stage2_consent_given_at / _ip / _log_id), consent_log, consent_verifications
 * Notes:  ADDENDUM_14F. Replaces direct anon Supabase writes in the client consent page.
 *         BUILD_72 P1-R8b-3: version + consent_log shape come from lib/screening/screeningConsent.ts, shared with
 *         the co-applicant route; the application row now carries the consent's IP and log id, as a party row does.
 *         verificationId is optional (null if applicant has no phone on file).
 *         When present, verification status is re-checked server-side before consent is recorded.
 */
import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { insertScreeningConsentLog } from "@/lib/screening/screeningConsent"

export async function POST(req: NextRequest) {
  const { token, verificationId, groupClauseShown } = await req.json() as {
    token?: string
    verificationId?: string | null
    /** The form rendered the group block (14X P5); recomputed against the application before it is recorded. */
    groupClauseShown?: boolean
  }

  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 })
  }

  const service = await createServiceClient()

  // F6: check expires_at (consistent with send-code applicant path)
  // THIS READ IS THE OWNERSHIP PROOF for the whole handler — the "prove ownership first" exit, with
  // the invite token as the proof. The caller is an unauthenticated applicant; there is no caller
  // org to scope to, and the application (and its org) is DERIVED from this row.
  const { data: tokenRow, error: tokenRowError } = await service
    .from("application_tokens")
    // eslint-disable-next-line pleks/require-org-scope-on-service-read -- bounded by the applicant's invite token; org is derived from this row, not asserted against it
    .select("application_id, applicant_email")
    .eq("token", token)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle()
    logQueryError("POST application_tokens", tokenRowError)

  if (!tokenRow) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 403 })
  }

  const { data: app, error: appError } = await service
    .from("applications")
    // eslint-disable-next-line pleks/require-org-scope-on-service-read -- bounded by the application_id the token above proves ownership of
    .select("org_id, stage2_consent_given")
    .eq("id", tokenRow.application_id)
    .single()
    logQueryError("POST applications", appError)

  if (!app) {
    return NextResponse.json({ error: "Application not found" }, { status: 404 })
  }

  if (app.stage2_consent_given) {
    return NextResponse.json({ ok: true, alreadyConsented: true })
  }

  // Re-verify SMS verification server-side if provided (ADDENDUM_14F)
  if (verificationId) {
    // ⚠ `.eq("application_id", …)` IS THE SECURITY BOUNDARY — see director-consent for the full
    //   narrative. `verificationId` is caller-supplied; the token above proves ownership of THIS
    //   application, not of an arbitrary verification row, so `status === "verified"` alone let any
    //   verified row on the platform satisfy the check and forge the provenance of a POPIA
    //   s11(1)(a) record. Bound on application_id rather than org_id, which is nullable here.
    const { data: verif, error: verifError } = await service
      .from("consent_verifications")
      // eslint-disable-next-line pleks/require-org-scope-on-service-read -- bound to the application the verified token above proves ownership of; consent_verifications.org_id is nullable and cannot carry this
      .select("status")
      .eq("id", verificationId)
      .eq("application_id", tokenRow.application_id)
      // The LEAD's own round: a co-applicant's round on the same application carries its access_token in
      // director_token (send-code), and is that person's verification, not this one's (BUILD_72 P1-R8).
      .is("director_token", null)
      .single()
    logQueryError("POST consent_verifications", verifError)

    if (verif?.status !== "verified") {
      return NextResponse.json({ error: "SMS verification not confirmed" }, { status: 403 })
    }
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null
  const now = new Date().toISOString()

  const logEntry = await insertScreeningConsentLog(service, {
    orgId:          app.org_id as string,
    subjectEmail:   tokenRow.applicant_email as string | null,
    applicationId:  tokenRow.application_id as string,
    ip,
    userAgent:      req.headers.get("user-agent"),
    verificationId: verificationId ?? null,
    groupClauseShown: groupClauseShown === true,
  })

  if (!logEntry.ok) {
    console.error("[invite-consent] consent_log insert failed:", logEntry.error)
    return NextResponse.json({ error: "Failed to record consent" }, { status: 500 })
  }

  // Link verification row back to consent_log
  if (verificationId) {
    // Same boundary on the write half — unbound, this overwrote the VICTIM row's consent_log_id.
    // The WRITE rule was blind to this surface until R2 aligned the two skip sets (see
    // director-consent for the narrative); it now fires here.
    await service
      .from("consent_verifications")
      // eslint-disable-next-line pleks/require-org-scope-on-service-write -- bound by .eq("application_id", …) below to the application the invite token proved; consent_verifications.org_id is nullable and cannot carry this
      .update({ consent_log_id: logEntry.id })
      .eq("id", verificationId)
      .eq("application_id", tokenRow.application_id)
  }

  const { error: updateErr } = await service
    .from("applications")
    // eslint-disable-next-line pleks/require-org-scope-on-service-write -- targets the application the invite token at the top of this handler proved ownership of; public applicant flow, no caller org
    .update({
      stage2_consent_given:    true,
      stage2_consent_given_at: now,
      stage2_consent_ip:       ip,
      stage2_consent_log_id:   logEntry.id,
      stage2_status:           "pending_payment",
    })
    .eq("id", tokenRow.application_id)

  if (updateErr) {
    console.error("[invite-consent] application update failed:", updateErr.message)
    return NextResponse.json({ error: "Failed to update application" }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
