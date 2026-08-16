/**
 * app/api/auth/passkeys/auth-options/route.ts — Generate WebAuthn authentication challenge
 *
 * Route:  POST /api/auth/passkeys/auth-options
 * Auth:   public (called pre-login, before a session exists)
 * Data:   reads user_passkeys for allowCredentials list; omit for discoverable credential flow
 */
import { generateAuthenticationOptions } from "@simplewebauthn/server"
import type { AuthenticatorTransportFuture } from "@simplewebauthn/server"
import { createServiceClient } from "@/lib/supabase/server"
import { getRpConfig } from "@/lib/auth/passkeys/rp-config"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { hashIp } from "@/lib/crypto"

export async function POST(req: Request) {
  let rp
  try {
    rp = getRpConfig(req)
  } catch {
    return new Response("Passkeys not available on this host", { status: 403 })
  }

  const serviceDb = await createServiceClient()
  const body = await req.json().catch(() => ({})) as { email?: string }
  const { email } = body

  let allowCredentials: { id: string; transports?: AuthenticatorTransportFuture[] }[] | undefined
  let userId: string | undefined

  if (email) {
    const { data: listData } = await serviceDb.auth.admin.listUsers()
    const found = listData?.users?.find(u => u.email === email)
    userId = found?.id

    if (userId) {
      const { data: creds, error: credsError } = await serviceDb
        .from("user_passkeys")
        .select("credential_id, transports")
        .eq("user_id", userId)
        .eq("rp_id", rp.rpId)
        .is("revoked_at", null)
        logQueryError("POST user_passkeys", credsError)

      // ADDENDUM_62F §4 + §13.5: DO NOT send stored `transports` here.
      //
      // A credential registered on a laptop stores transports ["internal"]. Passing that back tells
      // the platform "this credential is only reachable on this device's built-in authenticator",
      // which SUPPRESSES the hybrid (scan-a-QR-with-your-phone) flow the browser would otherwise
      // offer for free. That is the exact cross-device sign-in §4 exists to preserve, and this is
      // the path where it was being suppressed — the usernameless path already passes
      // `allowCredentials: undefined` and was never affected.
      //
      // It also matters for WHO lands here: this branch runs when the client posts an email, which
      // is the fallback for a user whose authenticator could not create a discoverable credential.
      // §13.5 sequences this fix BEFORE flipping residentKey to "required" precisely so the fallback
      // is good before more users are pushed onto it.
      //
      // Omitting transports is the safe direction: the platform then offers every route it can.
      allowCredentials = (creds ?? []).map(c => ({ id: c.credential_id as string }))  // base64url text
    }
  }

  const options = await generateAuthenticationOptions({
    rpID: rp.rpId,
    timeout: 60_000,
    // UV symmetry (ADDENDUM_62C D-62C-06): auth-verify passes requireUserVerification:true.
    userVerification: "required",
    allowCredentials,
  })

  const ipHash = await clientIpHash(req)
  await serviceDb.from("passkey_challenges").insert({
    user_id: userId ?? null,
    challenge: options.challenge,  // base64url text — store straight through
    ceremony_type: "authentication",
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
