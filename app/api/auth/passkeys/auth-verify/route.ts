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

  const credentialIdBuf = Buffer.from(response.id, "base64url")
  // Supabase PostgREST accepts bytea as \x<hex>
  const credentialIdHex = String.raw`\x` + credentialIdBuf.toString("hex")

  const { data: cred, error: credErr } = await serviceDb
    .from("user_passkeys")
    .select("id, user_id, credential_id, public_key, counter, transports, device_type")
    .eq("rp_id", rp.rpId)
    .is("revoked_at", null)
    .filter("credential_id", "eq", credentialIdHex)
    .maybeSingle()

  if (credErr || !cred) {
    return new Response("Unknown credential", { status: 400 })
  }

  const { data: challenge, error: challengeErr } = await serviceDb
    .from("passkey_challenges")
    .select("id, challenge")
    .eq("ceremony_type", "authentication")
    .eq("rp_id", rp.rpId)
    .is("consumed_at", null)
    .gte("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  if (challengeErr || !challenge) {
    return new Response("No valid challenge", { status: 400 })
  }

  let verification
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: Buffer.from(challenge.challenge as unknown as Uint8Array).toString("base64url"),
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpId,
      requireUserVerification: true,
      credential: {
        id: Buffer.from(cred.credential_id as unknown as Uint8Array).toString("base64url"),
        publicKey: cred.public_key as unknown as Uint8Array<ArrayBuffer>,
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

  await serviceDb
    .from("passkey_challenges")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", challenge.id)

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
