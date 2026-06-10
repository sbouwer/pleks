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
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { safeRedirect } from "@/lib/auth/safe-redirect"

// Soft email verification: clicking the emailed link proves inbox ownership → stamp user_profiles.
async function stampEmailVerified(supabase: Awaited<ReturnType<typeof createClient>>): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const service = await createServiceClient()
  const { error } = await service
    .from("user_profiles").update({ email_verified_at: new Date().toISOString() }).eq("id", user.id)
  if (error) console.error("verify_email stamp failed:", error.message)
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get("code")
  const next = searchParams.get("next")
  const verifyEmail = searchParams.get("verify_email") === "1"

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      if (verifyEmail) await stampEmailVerified(supabase)
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
