/**
 * app/api/consent/send-code/route.ts — Send SMS verification code for consent
 *
 * Route:  POST /api/consent/send-code
 * Auth:   token-based (applicant_token or director_token) — validated server-side
 * Data:   consent_verifications (insert), consent_verification_rate_limits, applications,
 *         application_co_applicants, application_tokens, audit_log
 * Notes:  ADDENDUM_14F. Resolves phone from token server-side (client never sends phone).
 *         Returns verification_id (not the code). Respects rate limits.
 *         consent_type determines which token field is used (director_* vs standard_*).
 */
import { NextResponse } from "next/server"
import * as Sentry from "@sentry/nextjs"
import { headers } from "next/headers"
import { createServiceClient } from "@/lib/supabase/server"
import {
  generateCode, generateSalt, hashCode, normalizePhoneZA, maskPhone,
  checkRateLimit, recordSend, type ConsentType,
} from "@/lib/consent/verification"
import { sendConsentSMS } from "@/lib/sms/sendConsentSMS"

const SMS_TEMPLATE = (code: string, special: boolean) =>
  special
    ? `Pleks: Your special-information consent code is ${code}. Valid 5 min. Do not share. If you did not request this, ignore.`
    : `Pleks: Your screening consent code is ${code}. Valid 5 min. Do not share. If you did not request this, ignore.`

const CODE_TTL_MS = 5 * 60 * 1000

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
    const isDirector = consentType.startsWith("director_")
    const service = await createServiceClient()
    const headersList = await headers()
    const clientIp = headersList.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null
    const userAgent = headersList.get("user-agent") ?? null

    // Resolve phone + context from token
    let phoneRaw: string | null = null
    let applicationId: string | null = null
    let orgId: string | null = null
    let directorToken: string | null = null

    if (isDirector) {
      const { data: coApp } = await service
        .from("application_co_applicants")
        .select("id, applicant_phone, primary_application_id, org_id, declined_at, access_token_expires")
        .eq("access_token", token)
        .is("declined_at", null)
        .single()

      if (!coApp) return NextResponse.json({ error: "Invalid or expired director token" }, { status: 404 })
      if (coApp.access_token_expires && new Date(coApp.access_token_expires as string) < new Date()) {
        return NextResponse.json({ error: "Director token expired" }, { status: 410 })
      }

      phoneRaw   = coApp.applicant_phone as string | null
      applicationId = coApp.primary_application_id as string
      orgId      = coApp.org_id as string | null
      directorToken = token
    } else {
      // Applicant invite token path
      const { data: tokenRow } = await service
        .from("application_tokens")
        .select("application_id")
        .eq("token", token)
        .maybeSingle()

      if (!tokenRow) return NextResponse.json({ error: "Invalid applicant token" }, { status: 404 })

      applicationId = tokenRow.application_id as string

      const { data: app } = await service
        .from("applications")
        .select("applicant_phone, org_id")
        .eq("id", applicationId)
        .single()

      if (!app) return NextResponse.json({ error: "Application not found" }, { status: 404 })
      phoneRaw = app.applicant_phone as string | null
      orgId    = app.org_id as string | null
    }

    if (!phoneRaw) {
      return NextResponse.json({ error: "No phone number on file for this applicant" }, { status: 422 })
    }

    const phoneE164 = normalizePhoneZA(phoneRaw)

    // Rate limit check
    const rateCheck = await checkRateLimit(phoneE164)
    if (!rateCheck.allowed) {
      return NextResponse.json({
        error: rateCheck.reason ?? "Rate limit exceeded",
        retryAfterSeconds: rateCheck.retryAfterSeconds,
      }, { status: 429 })
    }

    // Generate code and insert verification row
    const code = generateCode()
    const salt = generateSalt()
    const codeHash = hashCode(code, salt)
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

    // Send SMS
    const isSpecial = consentType === "estate_criminal" || consentType === "director_estate_criminal"
    const smsResult = await sendConsentSMS(phoneE164, SMS_TEMPLATE(code, isSpecial), orgId, verif.id)

    if (!smsResult.sent) {
      // Mark verification as abandoned so the stale row doesn't linger
      await service.from("consent_verifications").update({ status: "abandoned" }).eq("id", verif.id)
      return NextResponse.json({ error: "SMS send failed — please try again" }, { status: 502 })
    }

    // Record send in rate limit tracker
    await recordSend(phoneE164)

    // Audit
    await service.from("audit_log").insert({
      org_id:     orgId,
      table_name: "consent_verifications",
      record_id:  verif.id,
      action:     "INSERT",
      new_values: {
        consent_type:          consentType,
        verification_method:   "sms_code",
        target_masked:         maskPhone(phoneE164),
        application_id:        applicationId,
        director_token_used:   !!directorToken,
      },
    })

    return NextResponse.json({
      verificationId:    verif.id,
      targetMasked:      maskPhone(phoneE164),
      expiresAt:         codeExpiresAt,
    })
  } catch (err) {
    Sentry.captureException(err, { tags: { route: "consent/send-code" } })
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
