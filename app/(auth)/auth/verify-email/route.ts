/**
 * app/(auth)/auth/verify-email/route.ts — lands the email-verification magic link
 *
 * Route:  /auth/verify-email  (emailRedirectTo target of sendEmailVerification)
 * Auth:   the magic-link code/token itself proves the user owns the inbox.
 * Notes:  Exchanges the link (PKCE ?code= or ?token_hash=&type=), then stamps user_profiles.email_verified_at
 *         for that user. Always lands on the dashboard — verification is soft, never a gate.
 */
import { NextRequest, NextResponse } from "next/server"
import type { EmailOtpType } from "@supabase/supabase-js"
import { createClient, createServiceClient } from "@/lib/supabase/server"

export async function GET(req: NextRequest) {
  const url = req.nextUrl
  const code = url.searchParams.get("code")
  const tokenHash = url.searchParams.get("token_hash")
  const type = url.searchParams.get("type") as EmailOtpType | null

  const supa = await createClient()
  let userId: string | null = null
  if (code) {
    const { data, error } = await supa.auth.exchangeCodeForSession(code)
    if (!error) userId = data.user?.id ?? null
  } else if (tokenHash && type) {
    const { data, error } = await supa.auth.verifyOtp({ token_hash: tokenHash, type })
    if (!error) userId = data.user?.id ?? null
  }

  if (userId) {
    const service = await createServiceClient()
    const { error } = await service
      .from("user_profiles").update({ email_verified_at: new Date().toISOString() }).eq("id", userId)
    if (error) console.error("verify-email stamp failed:", error.message)
  }

  return NextResponse.redirect(new URL(userId ? "/dashboard?email_verified=1" : "/dashboard", url.origin))
}
