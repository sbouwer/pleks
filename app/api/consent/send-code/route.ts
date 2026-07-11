/**
 * app/api/consent/send-code/route.ts — Send SMS verification code for consent
 *
 * Route:  POST /api/consent/send-code
 * Auth:   token-based (applicant_token or director_token) — validated server-side
 * Data:   consent_verifications (insert), consent_verification_rate_limits, applications,
 *         application_co_applicants, application_tokens, audit_log, auth_events
 * Notes:  ADDENDUM_14F. Resolves phone from token server-side (client never sends phone).
 *         Returns verification_id (not the code). Respects rate limits.
 *         consent_type determines which token field is used (director_* vs standard_*).
 *         F2: writes auth_events (consent_code_sent) — user_id nullable since BUILD_63 §9.2.
 *         F6: application_tokens.expires_at checked in applicant path.
 */
import { NextResponse } from "next/server"
import * as Sentry from "@sentry/nextjs"
import { headers } from "next/headers"
import { createServiceClient } from "@/lib/supabase/server"
import {
  generateCode, generateSalt, hashCode, maskPhone,
  checkRateLimit, recordSend, type ConsentType,
} from "@/lib/consent/verification"
import { sendConsentSMS } from "@/lib/sms/sendConsentSMS"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { normalizePhone } from "@/lib/validation/contact"
import { recordAudit } from "@/lib/audit/recordAudit"

const SMS_TEMPLATE = (code: string, special: boolean) =>
  special
    ? `Pleks: Your special-information consent code is ${code}. Valid 5 min. Do not share. If you did not request this, ignore.`
    : `Pleks: Your screening consent code is ${code}. Valid 5 min. Do not share. If you did not request this, ignore.`

const CODE_TTL_MS = 5 * 60 * 1000

interface TokenContext {
  phoneRaw:      string | null
  applicationId: string
  orgId:         string | null
  directorToken: string | null
}

type TokenContextResult =
  | { ok: true;  ctx: TokenContext }
  | { ok: false; response: ReturnType<typeof NextResponse.json> }

async function resolveTokenContext(
  service: Awaited<ReturnType<typeof createServiceClient>>,
  token: string,
  isDirector: boolean,
): Promise<TokenContextResult> {
  if (isDirector) {
    const { data: coApp, error: coAppError } = await service
      .from("application_co_applicants")
      .select("id, applicant_phone, primary_application_id, org_id, declined_at, access_token_expires")
      .eq("access_token", token)
      .is("declined_at", null)
      .single()
    logQueryError("resolveTokenContext application_co_applicants", coAppError)

    if (!coApp) {
      return { ok: false, response: NextResponse.json({ error: "Invalid or expired director token" }, { status: 404 }) }
    }
    if (coApp.access_token_expires && new Date(coApp.access_token_expires as string) < new Date()) {
      return { ok: false, response: NextResponse.json({ error: "Director token expired" }, { status: 410 }) }
    }

    return {
      ok: true,
      ctx: {
        phoneRaw:      coApp.applicant_phone as string | null,
        applicationId: coApp.primary_application_id as string,
        orgId:         coApp.org_id as string | null,
        directorToken: token,
      },
    }
  }

  // Applicant invite token path (F6: expires_at filter)
  const { data: tokenRow, error: tokenRowError } = await service
    .from("application_tokens")
    .select("application_id")
    .eq("token", token)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle()
    logQueryError("resolveTokenContext application_tokens", tokenRowError)

  if (!tokenRow) {
    return { ok: false, response: NextResponse.json({ error: "Invalid or expired applicant token" }, { status: 404 }) }
  }

  const { data: app, error: appError } = await service
    .from("applications")
    .select("applicant_phone, org_id")
    .eq("id", tokenRow.application_id as string)
    .single()
    logQueryError("resolveTokenContext applications", appError)

  if (!app) {
    return { ok: false, response: NextResponse.json({ error: "Application not found" }, { status: 404 }) }
  }

  return {
    ok: true,
    ctx: {
      phoneRaw:      app.applicant_phone as string | null,
      applicationId: tokenRow.application_id as string,
      orgId:         app.org_id as string | null,
      directorToken: null,
    },
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as { token?: string; consent_type?: string }
    const { token, consent_type } = body

    if (!token || !consent_type) {
      return NextResponse.json({ error: "Missing token or consent_type" }, { status: 400 })
    }

    const validTypes: ConsentType[] = [
      "standard_bundle", "estate_criminal", "director_standard", "director_estate_criminal",
    ]
    if (!validTypes.includes(consent_type as ConsentType)) {
      return NextResponse.json({ error: "Invalid consent_type" }, { status: 400 })
    }

    const consentType = consent_type as ConsentType
    const isDirector  = consentType.startsWith("director_")
    const service     = await createServiceClient()
    const headersList = await headers()
    const clientIp    = headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null
    const userAgent   = headersList.get("user-agent") ?? null

    const resolved = await resolveTokenContext(service, token, isDirector)
    if (!resolved.ok) return resolved.response
    const { phoneRaw, applicationId, orgId, directorToken } = resolved.ctx

    if (!phoneRaw) {
      return NextResponse.json({ error: "No phone number on file for this applicant" }, { status: 422 })
    }

    const phoneE164 = normalizePhone(phoneRaw)
    if (!phoneE164) {
      return NextResponse.json({ error: "Phone number on file is not valid" }, { status: 422 })
    }

    const rateCheck = await checkRateLimit(phoneE164)
    if (!rateCheck.allowed) {
      return NextResponse.json({
        error:             rateCheck.reason ?? "Rate limit exceeded",
        retryAfterSeconds: rateCheck.retryAfterSeconds,
      }, { status: 429 })
    }

    const code          = generateCode()
    const salt          = generateSalt()
    const codeHash      = hashCode(code, salt)
    const codeExpiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString()

    const { data: verif, error: verifErr } = await service
      .from("consent_verifications")
      .insert({
        org_id:              orgId,
        application_id:      applicationId,
        director_token:      directorToken,
        consent_type:        consentType,
        verification_method: "sms_code",
        target_phone_e164:   phoneE164,
        code_hash:           codeHash,
        code_salt:           salt,
        code_expires_at:     codeExpiresAt,
        status:              "pending",
        client_ip:           clientIp,
        user_agent:          userAgent,
      })
      .select("id")
      .single()

    if (verifErr || !verif) {
      console.error("[send-code] insert failed:", verifErr?.message)
      return NextResponse.json({ error: "Failed to create verification" }, { status: 500 })
    }

    const isSpecial = consentType === "estate_criminal" || consentType === "director_estate_criminal"
    const smsResult = await sendConsentSMS(phoneE164, SMS_TEMPLATE(code, isSpecial), orgId, verif.id)

    if (!smsResult.sent) {
      await service.from("consent_verifications").update({ status: "abandoned" }).eq("id", verif.id)
      return NextResponse.json({ error: "SMS send failed — please try again" }, { status: 502 })
    }

    await recordSend(phoneE164)

    const auditMeta = {
      consent_type:        consentType,
      verification_method: "sms_code",
      target_masked:       maskPhone(phoneE164),
      application_id:      applicationId,
      director_token_used: !!directorToken,
    }

    await recordAudit(service, { orgId: orgId as string, table: "consent_verifications", recordId: verif.id, action: "INSERT", after: auditMeta })

    // F2: auth_events — consent_code_sent (user_id nullable since BUILD_63 §9.2)
    const { error: aeErr } = await service.from("auth_events").insert({
      org_id:    orgId,
      user_id:   null,
      event_type: "consent_code_sent",
      success:   true,
      metadata:  auditMeta,
    })
    if (aeErr) console.error("[send-code] auth_events insert failed:", aeErr.message)

    return NextResponse.json({
      verificationId: verif.id,
      targetMasked:   maskPhone(phoneE164),
      expiresAt:      codeExpiresAt,
    })
  } catch (err) {
    Sentry.captureException(err, { tags: { route: "consent/send-code" } })
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
