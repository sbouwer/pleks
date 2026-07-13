/**
 * app/api/consent/verify-code/route.ts — Validate submitted SMS code
 *
 * Route:  POST /api/consent/verify-code
 * Auth:   verification_id lookup (service client)
 * Data:   consent_verifications (update), consent_verification_rate_limits, audit_log, auth_events
 * Notes:  ADDENDUM_14F. Constant-time HMAC comparison. Returns status: verified | invalid |
 *         locked | expired. Does NOT record consent_log row — caller does that after
 *         verification succeeds (keeping consent recording in the existing flow).
 *         F2: writes auth_events for all three outcomes (verified/failed/locked_out).
 */
import { NextResponse } from "next/server"
import * as Sentry from "@sentry/nextjs"
import { createServiceClient } from "@/lib/supabase/server"
import { recordAudit } from "@/lib/audit/recordAudit"
import {
  verifyCodeMatch, recordFailedAttempt, resetFailedAttempts,
} from "@/lib/consent/verification"

/**
 * A POPIA consent event that FAILED TO RECORD is not a logging problem — it is a missing compliance record
 * behind a screen that said "verified".
 *
 * These inserts have been failing with a 23514 on EVERY consent round since 2026-05-27, when a DROP+ADD on
 * `auth_events_event_type_check` silently dropped the eight consent_* values a fortnight after they were added.
 * Nobody noticed for seven weeks, because the failure went to `console.error` and the route still returned 200.
 * The constraint is restored (010 §); this makes the NEXT one impossible to miss.
 *
 * Deliberately does NOT fail the request: whether a verification should be REFUSED when its audit row cannot be
 * written is a POPIA question, not an engineering one, and it is flagged for a ruling rather than guessed at
 * (OUTSTANDING § D-CONSENT-01). What it must never do again is stay quiet.
 */
function reportConsentAuditFailure(event: string, err: { message: string }): void {
  console.error(`[consent] auth_events ${event} insert FAILED:`, err.message)
  Sentry.captureMessage(`consent audit row not written: ${event}`, {
    level: "error",
    tags: { area: "popia-consent-audit", event },
    extra: { dbError: err.message },
  })
}

const MAX_ATTEMPTS = 3

export async function POST(req: Request) {
  try {
    const body = await req.json() as { verificationId?: string; code?: string }

    const { verificationId, code } = body

    if (!verificationId || !code) {
      return NextResponse.json({ error: "Missing verificationId or code" }, { status: 400 })
    }

    const service = await createServiceClient()

    const { data: verif, error: verifErr } = await service
      .from("consent_verifications")
      .select("id, org_id, application_id, director_token, consent_type, code_hash, code_salt, code_expires_at, attempts, status, target_phone_e164")
      .eq("id", verificationId)
      .single()

    if (verifErr || !verif) {
      return NextResponse.json({ error: "Verification not found" }, { status: 404 })
    }

    // State checks
    if (verif.status === "verified") {
      return NextResponse.json({ status: "already_verified" })
    }
    if (verif.status !== "pending") {
      return NextResponse.json({ status: "expired" })
    }
    if (new Date(verif.code_expires_at as string) < new Date()) {
      await service.from("consent_verifications").update({ status: "expired" }).eq("id", verificationId)
      return NextResponse.json({ status: "expired" })
    }

    const attempts = (verif.attempts as number) + 1

    // Increment attempt counter
    await service.from("consent_verifications").update({ attempts }).eq("id", verificationId)

    // Constant-time comparison
    const match = verifyCodeMatch(
      code.trim(),
      verif.code_hash as string,
      verif.code_salt as string,
    )

    const aeBase = {
      org_id:    verif.org_id,
      user_id:   null,
      metadata:  {
        verification_id: verificationId,
        consent_type:    verif.consent_type,
        application_id:  verif.application_id,
        is_director:     !!verif.director_token,
      },
    }

    if (!match) {
      const identifier = verif.target_phone_e164 as string
      await recordFailedAttempt(identifier)

      if (attempts >= MAX_ATTEMPTS) {
        await service.from("consent_verifications").update({ status: "invalidated" }).eq("id", verificationId)
        const { error: aeErr } = await service.from("auth_events").insert({
          ...aeBase,
          event_type: "consent_verification_locked_out",
          success:    false,
          metadata:   { ...aeBase.metadata, attempts },
        })
        if (aeErr) reportConsentAuditFailure("consent_verification_locked_out", aeErr)
        return NextResponse.json({ status: "locked", message: "Code invalidated — request a new one" })
      }

      const { error: aeErr } = await service.from("auth_events").insert({
        ...aeBase,
        event_type: "consent_verification_failed",
        success:    false,
        metadata:   { ...aeBase.metadata, attempts, attempts_remaining: MAX_ATTEMPTS - attempts },
      })
      if (aeErr) reportConsentAuditFailure("consent_verification_failed", aeErr)

      return NextResponse.json({
        status:            "invalid",
        attemptsRemaining: MAX_ATTEMPTS - attempts,
      })
    }

    // Verified
    const now = new Date().toISOString()
    await service.from("consent_verifications").update({
      status:           "verified",
      code_verified_at: now,
    }).eq("id", verificationId)

    const identifier = verif.target_phone_e164 as string
    await resetFailedAttempts(identifier)

    await recordAudit(service, { orgId: verif.org_id, table: "consent_verifications", recordId: verificationId, action: "UPDATE", after: {
        status:           "verified",
        code_verified_at: now,
        consent_type:     verif.consent_type,
        application_id:   verif.application_id,
        director_token:   !!verif.director_token,
      } })

    const { error: aeErr } = await service.from("auth_events").insert({
      ...aeBase,
      event_type: "consent_code_verified",
      success:    true,
    })
    if (aeErr) reportConsentAuditFailure("consent_code_verified", aeErr)

    return NextResponse.json({ status: "verified", verificationId })
  } catch (err) {
    Sentry.captureException(err, { tags: { route: "consent/verify-code" } })
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
