/**
 * app/api/auth/passkeys/auth-verify/route.ts — Verify passkey auth response and mint session
 *
 * Route:  POST /api/auth/passkeys/auth-verify
 * Auth:   public (session is created by this handler via mint-session)
 */
import { verifyAuthenticationResponse } from "@simplewebauthn/server"
import type { AuthenticationResponseJSON, AuthenticatorTransportFuture } from "@simplewebauthn/server"
import { createServiceClient } from "@/lib/supabase/server"
import { getRpConfig } from "@/lib/auth/passkeys/rp-config"
import { b64urlToBytes } from "@/lib/auth/passkeys/encoding"
import { logAuthEvent } from "@/lib/auth/events"
import { mintSupabaseSessionForUser } from "@/lib/auth/passkeys/mint-session"

export async function POST(req: Request) {
  let rp
  try {
    rp = getRpConfig(req)
  } catch {
    return new Response("Passkeys not available on this host", { status: 403 })
  }

  const body = await req.json() as { response: AuthenticationResponseJSON }
  const { response } = body

  const serviceDb = await createServiceClient()

  const { data: cred, error: credErr } = await serviceDb
    .from("user_passkeys")
    .select("id, user_id, credential_id, public_key, counter, transports, device_type")
    .eq("rp_id", rp.rpId)
    .is("revoked_at", null)
    .eq("credential_id", response.id)  // credential_id stored as base64url text == response.id
    .maybeSingle()

  if (credErr || !cred) {
    return new Response("Unknown credential", { status: 400 })
  }

  const { data: challenge, error: challengeErr } = await serviceDb
    .from("passkey_challenges")
    .select("id, challenge")
    .eq("ceremony_type", "authentication")
    .eq("rp_id", rp.rpId)
    // Bind to the resolving user, or a usernameless/discoverable-credential challenge
    // (user_id null) — ADDENDUM_62C D-62C-07. Tightens cross-request challenge mixing
    // without breaking discoverable-credential login.
    .or(`user_id.eq.${cred.user_id},user_id.is.null`)
    .is("consumed_at", null)
    .gte("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (challengeErr || !challenge) {
    return new Response("No valid challenge", { status: 400 })
  }

  // Consume-on-attempt (ADDENDUM_62C D-62C-05): single-use, even on failure.
  await serviceDb.from("passkey_challenges").update({ consumed_at: new Date().toISOString() }).eq("id", challenge.id)

  let verification
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge.challenge as string,  // base64url text
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpId,
      requireUserVerification: true,
      credential: {
        id: cred.credential_id as string,                // base64url text
        publicKey: b64urlToBytes(cred.public_key as string),
        counter: cred.counter as number,
        transports: (cred.transports ?? []) as AuthenticatorTransportFuture[],
      },
    })
  } catch {
    await logAuthEvent({ userId: cred.user_id as string, eventType: "passkey_failed", success: false, failureReason: "verification_error" })
    return new Response("Verification error", { status: 400 })
  }

  if (!verification.verified) {
    await logAuthEvent({ userId: cred.user_id as string, eventType: "passkey_failed", success: false, failureReason: "verification_failed" })
    return new Response("Verification failed", { status: 400 })
  }

  const { newCounter } = verification.authenticationInfo

  // Counter enforcement for single-device credentials (D-AUTH-01 spec §6.3)
  if (cred.device_type === "singleDevice" && newCounter <= (cred.counter as number)) {
    await logAuthEvent({
      userId: cred.user_id as string,
      eventType: "passkey_failed",
      success: false,
      failureReason: "counter_regression",
      metadata: { stored: cred.counter, presented: newCounter },
    })
    return new Response("Possible credential cloning detected", { status: 400 })
  }

  const ipHash = await hashIp(req)
  await serviceDb
    .from("user_passkeys")
    .update({ counter: newCounter, last_used_at: new Date().toISOString(), last_used_ip_hash: ipHash })
    .eq("id", cred.id)

  // challenge already consumed-on-attempt above (D-62C-05)

  const session = await mintSupabaseSessionForUser(cred.user_id as string)

  await logAuthEvent({
    userId: cred.user_id as string,
    eventType: "passkey_verified",
    success: true,
    aal: "aal2",
    authMethod: "passkey",
    sessionId: session.access_token_jti,
  })

  return Response.json({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
  })
}

async function hashIp(req: Request): Promise<string | null> {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null
  if (!ip) return null
  const { createHash } = await import("node:crypto")
  return createHash("sha256").update(ip).digest("hex")
}
