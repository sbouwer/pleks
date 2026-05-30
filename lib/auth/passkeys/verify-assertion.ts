/**
 * lib/auth/passkeys/verify-assertion.ts — Verify a WebAuthn authentication assertion
 *
 * Auth:   Server-only. Single source of truth for passkey assertion verification, used by
 *         passkey LOGIN (auth-verify) and passkey STEP-UP (step-up/passkey). Looks up the
 *         credential, consumes a matching authentication challenge (single-use, even on
 *         failure — D-62C-05), verifies via @simplewebauthn, enforces the signature counter,
 *         and persists the new counter + last-used metadata.
 * Notes:  Returns a discriminated result; the caller decides what to mint/log. Binary fields
 *         are base64url TEXT (ADDENDUM_62C), decoded via encoding.ts — never bytea casts.
 */
import { verifyAuthenticationResponse } from "@simplewebauthn/server"
import type { AuthenticationResponseJSON, AuthenticatorTransportFuture } from "@simplewebauthn/server"
import { createServiceClient } from "@/lib/supabase/server"
import { b64urlToBytes } from "@/lib/auth/passkeys/encoding"

export type AssertionResult =
  | { ok: true; userId: string }
  | { ok: false; status: number; message: string; reason: string; userId?: string }

export async function verifyPasskeyAssertion(opts: {
  rp:       { rpId: string; origin: string }
  response: AuthenticationResponseJSON
  ipHash?:  string | null
}): Promise<AssertionResult> {
  const { rp, response, ipHash } = opts
  const serviceDb = await createServiceClient()

  const { data: cred, error: credErr } = await serviceDb
    .from("user_passkeys")
    .select("id, user_id, credential_id, public_key, counter, transports, device_type")
    .eq("rp_id", rp.rpId)
    .is("revoked_at", null)
    .eq("credential_id", response.id) // base64url text == response.id
    .maybeSingle()
  if (credErr || !cred) {
    return { ok: false, status: 400, message: "Unknown credential", reason: "unknown_credential" }
  }
  const userId = cred.user_id as string

  const { data: challenge, error: challengeErr } = await serviceDb
    .from("passkey_challenges")
    .select("id, challenge")
    .eq("ceremony_type", "authentication")
    .eq("rp_id", rp.rpId)
    // Bind to the resolving user, or a usernameless/discoverable challenge (D-62C-07).
    .or(`user_id.eq.${userId},user_id.is.null`)
    .is("consumed_at", null)
    .gte("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (challengeErr || !challenge) {
    return { ok: false, status: 400, message: "No valid challenge", reason: "no_challenge", userId }
  }

  // Consume-on-attempt (D-62C-05): single-use, even on failure.
  await serviceDb.from("passkey_challenges").update({ consumed_at: new Date().toISOString() }).eq("id", challenge.id)

  let verification
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge.challenge as string,
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpId,
      requireUserVerification: true,
      credential: {
        id: cred.credential_id as string,
        publicKey: b64urlToBytes(cred.public_key as string),
        counter: cred.counter as number,
        transports: (cred.transports ?? []) as AuthenticatorTransportFuture[],
      },
    })
  } catch {
    return { ok: false, status: 400, message: "Verification error", reason: "verification_error", userId }
  }

  if (!verification.verified) {
    return { ok: false, status: 400, message: "Verification failed", reason: "verification_failed", userId }
  }

  const { newCounter } = verification.authenticationInfo

  // Counter enforcement for single-device credentials (D-AUTH-01 §6.3).
  if (cred.device_type === "singleDevice" && newCounter <= (cred.counter as number)) {
    return { ok: false, status: 400, message: "Possible credential cloning detected", reason: "counter_regression", userId }
  }

  await serviceDb
    .from("user_passkeys")
    .update({ counter: newCounter, last_used_at: new Date().toISOString(), last_used_ip_hash: ipHash ?? null })
    .eq("id", cred.id)

  return { ok: true, userId }
}
