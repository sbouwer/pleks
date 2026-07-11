/**
 * app/api/auth/passkeys/auth-verify/route.ts — Verify passkey auth response and mint session
 *
 * Route:  POST /api/auth/passkeys/auth-verify
 * Auth:   public (session is created by this handler via mint-session)
 * Notes:  Assertion verification is shared with passkey step-up via verifyPasskeyAssertion.
 */
import type { AuthenticationResponseJSON } from "@simplewebauthn/server"
import { getRpConfig } from "@/lib/auth/passkeys/rp-config"
import { verifyPasskeyAssertion } from "@/lib/auth/passkeys/verify-assertion"
import { logAuthEvent } from "@/lib/auth/events"
import { mintSupabaseSessionForUser } from "@/lib/auth/passkeys/mint-session"
import { issuePasskeyAal } from "@/lib/auth/passkey-aal-server"
import { hashIp } from "@/lib/crypto"

export async function POST(req: Request) {
  let rp
  try {
    rp = getRpConfig(req)
  } catch {
    return new Response("Passkeys not available on this host", { status: 403 })
  }

  const body = await req.json() as { response: AuthenticationResponseJSON }

  const result = await verifyPasskeyAssertion({ rp, response: body.response, ipHash: await clientIpHash(req) })
  if (!result.ok) {
    if (result.userId) {
      await logAuthEvent({ userId: result.userId, eventType: "passkey_failed", success: false, failureReason: result.reason })
    }
    return new Response(result.message, { status: result.status })
  }

  const session = await mintSupabaseSessionForUser(result.userId)

  // ADDENDUM_69 Slice A: a verified passkey grants the SESSION aal2 via a signed,
  // session-bound cookie — so the resolver doesn't bounce the user to TOTP after login.
  await issuePasskeyAal(result.userId, session.session_id)

  await logAuthEvent({
    userId: result.userId,
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

async function clientIpHash(req: Request): Promise<string | null> {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null
  if (!ip) return null
  return hashIp(ip)
}
