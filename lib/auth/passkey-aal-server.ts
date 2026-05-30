/**
 * lib/auth/passkey-aal-server.ts — issue/clear the passkey-AAL2 cookie (ADDENDUM_69 Slice A)
 *
 * Auth:   Route-handler only (uses next/headers cookies()). Pairs the signed cookie with
 *         its DB grant row on mint, and revokes both on sign-out / passkey-revoke.
 * Notes:  issuePasskeyAal is a no-op when the secret is unset or there's no session id —
 *         the system silently stays on Supabase AAL (TOTP). Never throws into the caller.
 */
import { cookies } from "next/headers"
import { mintPasskeyAal, PASSKEY_AAL_COOKIE, PASSKEY_AAL_TTL_MS } from "@/lib/auth/passkey-aal"
import {
  writePasskeyAalGrant,
  revokePasskeyAalByUser,
  revokePasskeyAalBySession,
} from "@/lib/auth/passkey-aal-db"

export async function issuePasskeyAal(userId: string, sessionId: string | null | undefined): Promise<void> {
  const minted = mintPasskeyAal(userId, sessionId)
  if (!minted || !sessionId) return // secret unset / no session → stay on Supabase AAL
  try {
    await writePasskeyAalGrant(userId, sessionId, minted.expiresAt)
    const store = await cookies()
    store.set(PASSKEY_AAL_COOKIE, minted.value, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === "production",
      sameSite: "lax",
      path:     "/",
      maxAge:   Math.floor(PASSKEY_AAL_TTL_MS / 1000),
    })
  } catch (e) {
    console.error("issuePasskeyAal failed:", e instanceof Error ? e.message : "unknown")
  }
}

export async function clearPasskeyAalCookie(): Promise<void> {
  try { (await cookies()).delete(PASSKEY_AAL_COOKIE) } catch { /* best-effort */ }
}

export async function revokePasskeyAalForUser(userId: string): Promise<void> {
  await revokePasskeyAalByUser(userId)
  await clearPasskeyAalCookie()
}

export async function revokePasskeyAalForSession(sessionId: string): Promise<void> {
  await revokePasskeyAalBySession(sessionId)
  await clearPasskeyAalCookie()
}
