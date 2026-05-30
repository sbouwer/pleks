/**
 * lib/auth/passkey-aal-db.ts — passkey-AAL2 grant revocation mirror (ADDENDUM_69 Slice A)
 *
 * Auth:   Server-only, service client. DB half of the passkey-AAL2 signal — write a grant
 *         row on mint, mark revoked on sign-out / passkey-revoke, and answer "is this
 *         session's grant revoked?" for the resolver. No cookies here (so it's safe to
 *         import from facts.ts on the gate path); cookie writes live in passkey-aal-server.
 * Notes:  passkeyAalRevoked FAILS CLOSED — a missing session id or a query error is treated
 *         as revoked, so the caller falls back to Supabase AAL (TOTP), never grants AAL2.
 */
import { createServiceClient } from "@/lib/supabase/server"

export async function writePasskeyAalGrant(userId: string, sessionId: string, expiresAt: Date): Promise<void> {
  const service = await createServiceClient()
  const { error } = await service.from("passkey_aal_grants").insert({
    user_id: userId, session_id: sessionId, expires_at: expiresAt.toISOString(), src: "passkey",
  })
  if (error) console.error("writePasskeyAalGrant failed:", error.message)
}

export async function revokePasskeyAalByUser(userId: string): Promise<void> {
  const service = await createServiceClient()
  const { error } = await service.from("passkey_aal_grants")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", userId).is("revoked_at", null)
  if (error) console.error("revokePasskeyAalByUser failed:", error.message)
}

export async function revokePasskeyAalBySession(sessionId: string): Promise<void> {
  const service = await createServiceClient()
  const { error } = await service.from("passkey_aal_grants")
    .update({ revoked_at: new Date().toISOString() })
    .eq("session_id", sessionId).is("revoked_at", null)
  if (error) console.error("revokePasskeyAalBySession failed:", error.message)
}

/** True if this session's passkey-AAL grant has been revoked. Fail-closed: no session id or a query error → treated as revoked. */
export async function passkeyAalRevoked(sessionId: string | null | undefined): Promise<boolean> {
  if (!sessionId) return true
  const service = await createServiceClient()
  const { data, error } = await service.from("passkey_aal_grants")
    .select("id").eq("session_id", sessionId).not("revoked_at", "is", null).limit(1)
  if (error) { console.error("passkeyAalRevoked check failed:", error.message); return true }
  return (data?.length ?? 0) > 0
}
