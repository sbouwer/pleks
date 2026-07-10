/**
 * lib/supabase/middleware.ts — Session refresh + AAL extraction for Next.js middleware
 *
 * Notes: JWT payloads are base64url (- and _ chars) — must convert to standard base64
 *        before atob(), otherwise AAL extraction silently fails on tokens with those chars.
 */
import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import type { User } from "@supabase/supabase-js"
import { verifyPasskeyAal, jwtIdentity, PASSKEY_AAL_COOKIE } from "@/lib/auth/passkey-aal"
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "@/lib/env"

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // getSession() reads the JWT locally (zero network) and we extract AAL from its
  // access_token — getUser() would not return the token and would add a gotrue call to
  // every gated request. The setAll handler above persists any cookies the client
  // rotates onto BOTH request and response, so a same-request page read sees them.
  //
  // NOTE (expired-token class): because this is getSession() (local), middleware does
  // not proactively force a refresh the way the canonical getUser() pattern does — so a
  // token that expired mid-flow is first hit by the destination page's own getUser(),
  // whose refresh fetch can THROW. That is handled at the edges (the /welcome page and
  // /auth/resolver guards recover to resolver/login instead of 500ing). Here we only
  // make middleware itself resilient: if getSession ever throws (a refresh attempt
  // failing in-flight), treat it as no session — the gate sends to /login cleanly
  // rather than crashing every route with a 500.
  let user: User | null = null
  let accessToken: string | undefined
  try {
    const { data: { session } } = await supabase.auth.getSession()
    user = session?.user ?? null
    accessToken = session?.access_token
  } catch (err) {
    console.error("[updateSession] getSession threw — treating as no session:", err instanceof Error ? err.message : "unknown")
  }

  // Extract AAL from the JWT payload — not exposed directly on the Session type.
  // OR-in the passkey-AAL2 signal (ADDENDUM_69 Slice A): a verified passkey mints a
  // signed, session-bound pleks_aal cookie that the gate verifies with zero network
  // (HMAC + expiry, identity read from the JWT it already has). Fail-closed — a forged/
  // expired/foreign token verifies false and the session stays at its Supabase AAL.
  // The resolver runs the SAME verifier (plus a DB revocation check); both seeing the
  // same result is what keeps gate↔resolver loop-safe.
  const aalFromJwt = extractAalFromJwt(accessToken)
  const identity = jwtIdentity(accessToken)
  const passkeyAal2 = verifyPasskeyAal(
    request.cookies.get(PASSKEY_AAL_COOKIE)?.value,
    { userId: identity.sub ?? undefined, sessionId: identity.sessionId },
  )
  const aal = aalFromJwt === "aal2" || passkeyAal2 ? "aal2" : aalFromJwt

  return { supabase, user, supabaseResponse, aal }
}

function extractAalFromJwt(accessToken: string | undefined): string | null {
  if (!accessToken) return null
  try {
    const raw = accessToken.split(".")[1]
    if (!raw) return null
    // JWT payloads are base64url (- → +, _ → /). atob needs standard base64 with padding.
    const padded = raw.replaceAll("-", "+").replaceAll("_", "/")
    const withPad = padded + "=".repeat((4 - padded.length % 4) % 4)
    const decoded = JSON.parse(atob(withPad)) as { aal?: string }
    return decoded.aal ?? null
  } catch {
    return null
  }
}
