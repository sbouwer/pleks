/**
 * app/(auth)/auth/callback/route.ts — OAuth and magic-link code exchange
 *
 * Route:  /auth/callback
 * Auth:   public — exchanges a one-time code for a session cookie
 * Notes:  After exchangeCodeForSession, routing is delegated entirely to /auth/resolver (I-1).
 *         ?next= is passed through to the resolver as ?redirect= so deep links survive.
 *         safeRedirect() sanitises ?next= to block open-redirect attacks.
 */
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { safeRedirect } from "@/lib/auth/safe-redirect"

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const next = searchParams.get("next")

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      const resolverUrl = new URL(`${origin}/auth/resolver`)
      if (next) {
        const safe = safeRedirect(next)
        if (safe && safe !== "/") resolverUrl.searchParams.set("redirect", safe)
      }
      return NextResponse.redirect(resolverUrl)
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}
