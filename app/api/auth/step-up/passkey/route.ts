/**
 * app/api/auth/step-up/passkey/route.ts — Verify a passkey assertion against a pending step-up
 *
 * Route:  POST /api/auth/step-up/passkey
 * Auth:   authenticated session required
 * Notes:  ADDENDUM_69 Slice B. Passkey as a step-up verifier ALONGSIDE the existing TOTP route
 *         (/api/auth/step-up) — the step_up_challenges engine (issuance, single-use consume,
 *         5-min window) is unchanged; this only adds passkey as an accepted proof. A passkey at
 *         LOGIN (Slice A session signal) does NOT satisfy step-up: this requires a FRESH
 *         assertion bound to a fresh WebAuthn challenge for THIS sensitive action.
 */
import { NextRequest, NextResponse } from "next/server"
import type { AuthenticationResponseJSON } from "@simplewebauthn/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { getRpConfig } from "@/lib/auth/passkeys/rp-config"
import { verifyPasskeyAssertion } from "@/lib/auth/passkeys/verify-assertion"
import { logAuthEvent } from "@/lib/auth/events"
import { hashIp } from "@/lib/crypto"

export async function POST(req: NextRequest): Promise<NextResponse> {
  let rp
  try { rp = getRpConfig(req) }
  catch { return NextResponse.json({ error: "Passkeys not available on this host" }, { status: 403 }) }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })

  const body = await req.json().catch(() => ({})) as {
    challengeToken?: string
    assertion?: AuthenticationResponseJSON
  }
  const { challengeToken, assertion } = body
  if (!challengeToken || !assertion) return NextResponse.json({ error: "Invalid request" }, { status: 400 })

  const db = await createServiceClient()

  // Validate the pending step-up challenge — identical checks to the TOTP route.
  const { data: challenge, error: challengeErr } = await db
    .from("step_up_challenges")
    .select("id, user_id, action, expires_at, verified_at, consumed_at")
    .eq("challenge_token", challengeToken)
    .maybeSingle()
  if (challengeErr || !challenge) return NextResponse.json({ error: "Challenge not found" }, { status: 400 })
  if (
    challenge.user_id !== user.id ||
    challenge.consumed_at ||
    challenge.verified_at ||
    new Date(challenge.expires_at) < new Date()
  ) {
    return NextResponse.json({ error: "Challenge invalid or expired" }, { status: 400 })
  }

  // Verify a FRESH passkey assertion (consumes its own single-use WebAuthn challenge).
  const result = await verifyPasskeyAssertion({ rp, response: assertion, ipHash: await clientIpHash(req) })
  if (!result.ok) {
    await logAuthEvent({
      userId: user.id, eventType: "step_up_failed", success: false,
      failureReason: result.reason, metadata: { action: challenge.action },
    })
    return NextResponse.json({ error: result.message }, { status: result.status })
  }

  // The asserting passkey MUST belong to the session user — never let one user satisfy another's
  // step-up, nor satisfy with someone else's credential.
  if (result.userId !== user.id) {
    await logAuthEvent({
      userId: user.id, eventType: "step_up_failed", success: false,
      failureReason: "passkey_user_mismatch", metadata: { action: challenge.action },
    })
    return NextResponse.json({ error: "Passkey does not belong to this user" }, { status: 400 })
  }

  await db.from("step_up_challenges").update({ verified_at: new Date().toISOString() }).eq("id", challenge.id)

  await logAuthEvent({
    userId: user.id, eventType: "step_up_verified", success: true,
    authMethod: "passkey", aal: "aal2", metadata: { action: challenge.action },
  })

  return NextResponse.json({ ok: true })
}

async function clientIpHash(req: NextRequest): Promise<string | null> {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null
  if (!ip) return null
  return hashIp(ip)
}
