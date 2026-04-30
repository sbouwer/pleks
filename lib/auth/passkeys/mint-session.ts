/**
 * lib/auth/passkeys/mint-session.ts — Mint a Supabase session for a user after passkey auth
 *
 * Notes: uses admin.generateLink() + verifyOtp() as a two-step exchange to produce real
 *        session tokens server-side without requiring the user's password. The magic link
 *        is never sent — it's consumed immediately on the server.
 */
import { createServiceClient } from "@/lib/supabase/server"

function extractJti(accessToken: string): string {
  try {
    const payload = JSON.parse(Buffer.from(accessToken.split(".")[1], "base64url").toString())
    return (payload.jti as string | undefined) ?? ""
  } catch {
    return ""
  }
}

export async function mintSupabaseSessionForUser(userId: string) {
  const serviceDb = await createServiceClient()

  const { data: userData, error: userErr } = await serviceDb.auth.admin.getUserById(userId)
  if (userErr || !userData.user?.email) throw new Error("User not found")

  const { data: link, error: linkErr } = await serviceDb.auth.admin.generateLink({
    type: "magiclink",
    email: userData.user.email,
  })
  if (linkErr || !link.properties?.hashed_token) throw new Error("Failed to generate link")

  const { data: session, error: sessionErr } = await serviceDb.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: "magiclink",
  })
  if (sessionErr || !session.session) throw new Error("Session mint failed")

  return {
    access_token: session.session.access_token,
    refresh_token: session.session.refresh_token,
    expires_at: session.session.expires_at,
    access_token_jti: extractJti(session.session.access_token),
  }
}
