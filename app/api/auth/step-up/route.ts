/**
 * app/api/auth/step-up/route.ts — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { logAuthEvent } from "@/lib/auth/events"

export async function POST(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { challengeToken?: string; code?: string }
  const { challengeToken, code } = body

  if (!challengeToken || !code || code.length !== 6) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 })
  }

  const db = await createServiceClient()

  // Load the challenge
  const { data: challenge, error: challengeErr } = await db
    .from("step_up_challenges")
    .select("id, user_id, action, expires_at, verified_at, consumed_at")
    .eq("challenge_token", challengeToken)
    .maybeSingle()

  if (challengeErr || !challenge) {
    return NextResponse.json({ error: "Challenge not found" }, { status: 400 })
  }

  if (
    challenge.user_id !== user.id ||
    challenge.consumed_at ||
    challenge.verified_at ||
    new Date(challenge.expires_at) < new Date()
  ) {
    return NextResponse.json({ error: "Challenge invalid or expired" }, { status: 400 })
  }

  // Get the user's enrolled TOTP factors
  const { data: factors, error: factorsErr } = await supabase.auth.mfa.listFactors()
  if (factorsErr || !factors?.totp?.length) {
    return NextResponse.json({ error: "No TOTP factor enrolled" }, { status: 400 })
  }

  const factor = factors.totp[0]

  // Challenge + verify the TOTP code
  const { data: challengeData, error: challengeCreateErr } = await supabase.auth.mfa.challenge({ factorId: factor.id })
  if (challengeCreateErr || !challengeData) {
    return NextResponse.json({ error: "TOTP challenge failed" }, { status: 500 })
  }

  const { error: verifyErr } = await supabase.auth.mfa.verify({
    factorId: factor.id,
    challengeId: challengeData.id,
    code,
  })

  if (verifyErr) {
    await logAuthEvent({
      userId: user.id,
      eventType: "step_up_failed",
      success: false,
      failureReason: verifyErr.message,
      metadata: { action: challenge.action },
    })
    return NextResponse.json({ error: "Invalid code" }, { status: 400 })
  }

  // Mark the step-up challenge as verified
  await db
    .from("step_up_challenges")
    .update({ verified_at: new Date().toISOString() })
    .eq("id", challenge.id)

  await logAuthEvent({
    userId: user.id,
    eventType: "step_up_verified",
    success: true,
    authMethod: "totp",
    aal: "aal2",
    metadata: { action: challenge.action },
  })

  return NextResponse.json({ ok: true })
}
