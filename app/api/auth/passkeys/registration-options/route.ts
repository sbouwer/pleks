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

export async function POST(req: Request) {
  let rp
  try {
    rp = getRpConfig(req)
  } catch {
    return new Response("Passkeys not available on this host", { status: 403 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response("Unauthenticated", { status: 401 })

  const serviceDb = await createServiceClient()

  const { data: existing } = await serviceDb
    .from("user_passkeys")
    .select("credential_id, transports")
    .eq("user_id", user.id)
    .eq("rp_id", rp.rpId)
    .is("revoked_at", null)

  const options = await generateRegistrationOptions({
    rpName: rp.rpName,
    rpID: rp.rpId,
    userName: user.email ?? user.id,
    userDisplayName: user.user_metadata?.full_name ?? user.email ?? user.id,
    userID: new TextEncoder().encode(user.id),
    timeout: 60_000,
    attestationType: "none",
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
    excludeCredentials: (existing ?? []).map(c => ({
      id: Buffer.from(c.credential_id as unknown as Uint8Array).toString("base64url"),
      transports: (c.transports ?? []) as AuthenticatorTransportFuture[],
    })),
  })

  const ipHash = await hashIp(req)
  await serviceDb.from("passkey_challenges").insert({
    user_id: user.id,
    challenge: Buffer.from(options.challenge, "base64url"),
    ceremony_type: "registration",
    rp_id: rp.rpId,
    origin: rp.origin,
    client_ip_hash: ipHash,
  })

  return Response.json(options)
}

async function hashIp(req: Request): Promise<string | null> {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null
  if (!ip) return null
  const { createHash } = await import("node:crypto")
  return createHash("sha256").update(ip).digest("hex")
}
