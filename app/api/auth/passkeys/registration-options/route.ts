/**
 * app/api/auth/passkeys/registration-options/route.ts — Generate WebAuthn registration challenge
 *
 * Route:  POST /api/auth/passkeys/registration-options
 * Auth:   aal1 session required (must be logged in to enrol a passkey)
 */
import { generateRegistrationOptions } from "@simplewebauthn/server"
import type { AuthenticatorTransportFuture } from "@simplewebauthn/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { getRpConfig } from "@/lib/auth/passkeys/rp-config"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { hashIp } from "@/lib/crypto"

export async function POST(req: Request) {
  let rp
  try {
    rp = getRpConfig(req)
  } catch {
    // Unknown host (e.g. a Vercel preview or the wrong URL) — passkeys can't bind safely here.
    // Return an actionable message so the client shows it instead of failing opaquely.
    return new Response("Passkeys aren't available on this web address. Open the app at its official URL (app.pleks.co.za, or localhost in development) and try again.", { status: 403 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response("Unauthenticated", { status: 401 })

  const serviceDb = await createServiceClient()

  const { data: existing, error: existingError } = await serviceDb
    .from("user_passkeys")
    .select("credential_id, transports")
    .eq("user_id", user.id)
    .eq("rp_id", rp.rpId)
    .is("revoked_at", null)
    logQueryError("POST user_passkeys", existingError)

  const options = await generateRegistrationOptions({
    rpName: rp.rpName,
    rpID: rp.rpId,
    userName: user.email ?? user.id,
    userDisplayName: user.user_metadata?.full_name ?? user.email ?? user.id,
    userID: new TextEncoder().encode(user.id),
    timeout: 60_000,
    attestationType: "none",
    authenticatorSelection: {
      // ADDENDUM_62F §2.1 + §13.5 step 2. "required" ⇒ a DISCOVERABLE credential, which is what
      // makes usernameless "just tap sign in" possible — no email typed. That matters most on budget
      // Androids on 3G, where typing an email IS the friction, and those users are the whole point.
      //
      // The tradeoff, stated because it is the reason this is sequenced: "required" HARD-FAILS
      // registration on authenticators with no discoverable-credential storage, and those skew to the
      // oldest devices — the same constituency. The fallback is the email-first path, so §13.5 fixed
      // that path FIRST (auth-options no longer suppresses hybrid). Reverting to "preferred" is an
      // acceptable resting state now that the fallback is good; it was a trap before.
      //
      // ⚠ Watch the registration-failure rate after this ships. Material failures → revert to
      // "preferred" per §13.5 step 3. That is a monitoring decision, not a design reversal.
      residentKey: "required",
      // UV symmetry (ADDENDUM_62C D-62C-06): verify passes requireUserVerification:true,
      // so options must REQUIRE it too — "preferred" here let a no-UV authenticator through
      // that verify then rejected (a spurious 400). Trust-account posture → UV mandatory.
      userVerification: "required",
    },
    excludeCredentials: (existing ?? []).map(c => ({
      id: c.credential_id as string,  // base64url text
      transports: (c.transports ?? []) as AuthenticatorTransportFuture[],
    })),
  })

  const ipHash = await clientIpHash(req)
  await serviceDb.from("passkey_challenges").insert({
    user_id: user.id,
    challenge: options.challenge,  // base64url text — store straight through
    ceremony_type: "registration",
    rp_id: rp.rpId,
    origin: rp.origin,
    client_ip_hash: ipHash,
  })

  return Response.json(options)
}

async function clientIpHash(req: Request): Promise<string | null> {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null
  if (!ip) return null
  return hashIp(ip)
}
