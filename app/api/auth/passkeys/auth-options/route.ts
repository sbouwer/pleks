/**
 * app/api/auth/passkeys/auth-options/route.ts — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
import { generateAuthenticationOptions } from "@simplewebauthn/server"
import type { AuthenticatorTransportFuture } from "@simplewebauthn/server"
import { createServiceClient } from "@/lib/supabase/server"
import { getRpConfig } from "@/lib/auth/passkeys/rp-config"

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
      const { data: creds } = await serviceDb
        .from("user_passkeys")
        .select("credential_id, transports")
        .eq("user_id", userId)
        .eq("rp_id", rp.rpId)
        .is("revoked_at", null)

      allowCredentials = (creds ?? []).map(c => ({
        id: Buffer.from(c.credential_id as unknown as Uint8Array).toString("base64url"),
        transports: (c.transports ?? []) as AuthenticatorTransportFuture[],
      }))
    }
  }

  const options = await generateAuthenticationOptions({
    rpID: rp.rpId,
    timeout: 60_000,
    userVerification: "preferred",
    allowCredentials,
  })

  const ipHash = await hashIp(req)
  await serviceDb.from("passkey_challenges").insert({
    user_id: userId ?? null,
    challenge: Buffer.from(options.challenge, "base64url"),
    ceremony_type: "authentication",
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
