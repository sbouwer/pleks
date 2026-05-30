/**
 * app/api/auth/logout/route.ts — Sign out and clear httpOnly org cookies
 *
 * Route:  POST /api/auth/logout
 * Auth:   any session (unauthenticated calls are safe no-ops)
 * Notes:  pleks_org and pleks_has_org are httpOnly — they cannot be cleared from the
 *         browser directly. All logout paths must call this endpoint.
 */
import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import { jwtIdentity } from "@/lib/auth/passkey-aal"
import { revokePasskeyAalForSession, clearPasskeyAalCookie } from "@/lib/auth/passkey-aal-server"

/**
 * POST /api/auth/logout
 *
 * Signs out the Supabase session and clears the custom org cookies
 * (pleks_org, pleks_has_org). These are httpOnly and cannot be deleted
 * from the browser, so all logout paths must call this endpoint.
 */
export async function POST() {
  const supabase = await createClient()

  // Capture the session id BEFORE signOut so we can revoke this session's passkey-AAL2 grant
  // (ADDENDUM_69 Slice A). The httpOnly pleks_aal cookie is cleared here too.
  const { data: { session } } = await supabase.auth.getSession()
  const sessionId = session ? jwtIdentity(session.access_token).sessionId : null

  await supabase.auth.signOut()

  const cookieStore = await cookies()
  cookieStore.delete("pleks_org")
  cookieStore.delete("pleks_has_org")

  if (sessionId) await revokePasskeyAalForSession(sessionId)
  else await clearPasskeyAalCookie()

  return NextResponse.json({ ok: true })
}
