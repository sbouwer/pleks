/**
 * lib/auth/passkey-aal.ts — Passkey → session-AAL2 signal (ADDENDUM_69 Slice A)
 *
 * Auth:   Security core. Mints + verifies an HMAC-signed, session-bound cookie that lets a
 *         verified passkey grant a session AAL2 (Supabase AAL only knows TOTP/phone, not our
 *         @simplewebauthn passkeys). Read by BOTH the gate (middleware, node runtime, zero
 *         network) and the resolver (which additionally checks DB revocation).
 * Notes:  FAIL CLOSED on every path. Absent PASSKEY_AAL_SECRET ⇒ verify returns false ⇒ the
 *         system falls back to Supabase AAL (TOTP) — disabled, never open. The token is bound
 *         to {sub, sid} (Supabase user id + the stable JWT session_id claim, OQ-A1 verified) so
 *         a token minted for one session/user is worthless in another (replay defence). This
 *         signal grants AAL2 for ROUTING only — it never satisfies a step-up (Slice B).
 */
import { createHmac, timingSafeEqual } from "node:crypto"
import { optionalEnv } from "@/lib/env"

export const PASSKEY_AAL_COOKIE = "pleks_aal"
export const PASSKEY_AAL_TTL_MS = 12 * 60 * 60 * 1000 // 12h — bounds the revoked-but-unexpired gate window

interface AalPayload {
  v:   1
  sub: string
  sid: string
  aal: "aal2"
  src: "passkey"
  iat: number
  exp: number
}

function getSecret(): string | null {
  const s = optionalEnv("PASSKEY_AAL_SECRET")
  return s && s.length >= 32 ? s : null
}

function hmac(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url")
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

/**
 * Mints the signed cookie value for a verified passkey. Returns null (no grant) when the
 * secret is unset/weak or the session id is missing — caller simply skips setting the cookie.
 */
export function mintPasskeyAal(
  userId: string,
  sessionId: string | null | undefined,
  now: number = Date.now(),
): { value: string; expiresAt: Date } | null {
  const secret = getSecret()
  if (!secret || !userId || !sessionId) return null
  const exp = Math.floor((now + PASSKEY_AAL_TTL_MS) / 1000)
  const payload: AalPayload = {
    v: 1, sub: userId, sid: sessionId, aal: "aal2", src: "passkey",
    iat: Math.floor(now / 1000), exp,
  }
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url")
  return { value: `${body}.${hmac(secret, body)}`, expiresAt: new Date(exp * 1000) }
}

/**
 * Verifies the signal against the LIVE session identity. Fail-closed: any tamper, mismatch,
 * expiry, malformed input, or missing secret ⇒ false. Same function on gate + resolver so
 * the two never diverge (divergence = the redirect-loop class).
 */
export function verifyPasskeyAal(
  token: string | undefined | null,
  live: { userId?: string; sessionId?: string | null },
  now: number = Date.now(),
): boolean {
  const secret = getSecret()
  if (!secret || !token) return false
  const dot = token.indexOf(".")
  if (dot <= 0 || dot >= token.length - 1) return false
  const body = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  if (!timingSafeEqualStr(sig, hmac(secret, body))) return false
  let p: Partial<AalPayload>
  try { p = JSON.parse(Buffer.from(body, "base64url").toString()) as Partial<AalPayload> }
  catch { return false }
  if (p.v !== 1 || p.aal !== "aal2") return false
  if (!live.userId || p.sub !== live.userId) return false
  if (!live.sessionId || p.sid !== live.sessionId) return false
  if (typeof p.exp !== "number" || p.exp * 1000 < now) return false
  return true
}

/**
 * Reads {sub, sessionId} from a Supabase access-token JWT without verifying its signature —
 * the caller already trusts the token (it came from updateSession / getSession). Used by the
 * gate to bind the signal with zero network. Returns nulls on any decode failure.
 */
export function jwtIdentity(accessToken: string | undefined | null): { sub: string | null; sessionId: string | null } {
  if (!accessToken) return { sub: null, sessionId: null }
  try {
    const raw = accessToken.split(".")[1]
    if (!raw) return { sub: null, sessionId: null }
    const claims = JSON.parse(Buffer.from(raw, "base64url").toString()) as { sub?: string; session_id?: string }
    return { sub: claims.sub ?? null, sessionId: claims.session_id ?? null }
  } catch {
    return { sub: null, sessionId: null }
  }
}
