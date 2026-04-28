import { verifyRegistrationResponse } from "@simplewebauthn/server"
import type { RegistrationResponseJSON } from "@simplewebauthn/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { getRpConfig } from "@/lib/auth/passkeys/rp-config"
import { logAuthEvent } from "@/lib/auth/events"

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

  const body = await req.json() as { response: RegistrationResponseJSON; label?: string }
  const { response, label } = body

  const serviceDb = await createServiceClient()

  const { data: challenge, error: challengeErr } = await serviceDb
    .from("passkey_challenges")
    .select("id, challenge")
    .eq("user_id", user.id)
    .eq("ceremony_type", "registration")
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
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: Buffer.from(challenge.challenge as unknown as Uint8Array).toString("base64url"),
      expectedOrigin: rp.origin,
      expectedRPID: rp.rpId,
      requireUserVerification: true,
    })
  } catch {
    await logAuthEvent({ userId: user.id, eventType: "passkey_enrolled", success: false, failureReason: "verification_error" })
    return new Response("Verification error", { status: 400 })
  }

  if (!verification.verified || !verification.registrationInfo) {
    await logAuthEvent({ userId: user.id, eventType: "passkey_enrolled", success: false, failureReason: "verification_failed" })
    return new Response("Verification failed", { status: 400 })
  }

  const { credential, credentialDeviceType, credentialBackedUp, aaguid } = verification.registrationInfo

  await serviceDb.from("user_passkeys").insert({
    user_id: user.id,
    credential_id: Buffer.from(credential.id, "base64url"),
    public_key: Buffer.from(credential.publicKey),
    counter: credential.counter,
    transports: response.response.transports ?? [],
    device_type: credentialDeviceType,
    backup_eligible: credentialBackedUp,
    backup_state: credentialBackedUp,
    label: label ?? deriveLabel(req),
    aaguid: aaguid ?? null,
    rp_id: rp.rpId,
    origin: rp.origin,
  })

  await serviceDb
    .from("passkey_challenges")
    .update({ consumed_at: new Date().toISOString() })
    .eq("id", challenge.id)

  await logAuthEvent({
    userId: user.id,
    eventType: "passkey_enrolled",
    success: true,
    metadata: { label, device_type: credentialDeviceType },
  })

  return Response.json({ ok: true })
}

function deriveLabel(req: Request): string {
  const ua = req.headers.get("user-agent") ?? ""
  if (/iPhone|iPad/.test(ua)) return "iPhone / iPad"
  if (/Android/.test(ua)) return "Android"
  if (/Mac/.test(ua)) return "Mac"
  if (/Windows/.test(ua)) return "Windows PC"
  return "Passkey"
}
