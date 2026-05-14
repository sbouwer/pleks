/**
 * app/api/consent/verify-code/route.ts — Validate submitted SMS code
 *
 * Route:  POST /api/consent/verify-code
 * Auth:   verification_id lookup (service client)
 * Data:   consent_verifications (update), consent_verification_rate_limits, audit_log
 * Notes:  ADDENDUM_14F. Constant-time HMAC comparison. Returns status: verified | invalid |
 *         locked | expired. Does NOT record consent_log row — caller does that after
 *         verification succeeds (keeping consent recording in the existing flow).
 */
import { NextResponse } from "next/server"
import * as Sentry from "@sentry/nextjs"
import { createServiceClient } from "@/lib/supabase/server"
import {
  verifyCodeMatch, recordFailedAttempt, resetFailedAttempts,
} from "@/lib/consent/verification"

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

    if (!match) {
      const identifier = verif.target_phone_e164 as string
      await recordFailedAttempt(identifier)

      if (attempts >= MAX_ATTEMPTS) {
        await service.from("consent_verifications").update({ status: "invalidated" }).eq("id", verificationId)
        return NextResponse.json({ status: "locked", message: "Code invalidated — request a new one" })
      }

      return NextResponse.json({
        status: "invalid",
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

    await service.from("audit_log").insert({
      org_id:     verif.org_id,
      table_name: "consent_verifications",
      record_id:  verificationId,
      action:     "UPDATE",
      new_values: {
        status:           "verified",
        code_verified_at: now,
        consent_type:     verif.consent_type,
        application_id:   verif.application_id,
        director_token:   !!verif.director_token,
      },
    })

    return NextResponse.json({ status: "verified", verificationId })
  } catch (err) {
    Sentry.captureException(err, { tags: { route: "consent/verify-code" } })
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
