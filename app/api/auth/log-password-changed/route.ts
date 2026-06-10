/**
 * app/api/auth/log-password-changed/route.ts — record a password change in auth_events (+ fire the
 *   Pleks-branded security email via logAuthEvent's chokepoint).
 *
 * Route:  POST /api/auth/log-password-changed
 * Auth:   the active session — only the signed-in user can log their own change.
 * Notes:  Password changes happen client-side (auth.updateUser({ password })) in PasswordForm and the
 *         reset-password page, so they never hit the server otherwise — leaving NO auth_events trace (a
 *         forensic gap). The client POSTs here after a successful update. Server-side logging works
 *         regardless of Resend; the email rides logAuthEvent and is dark until RESEND_API_KEY is set.
 */
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { logAuthEvent } from "@/lib/auth/events"

export async function POST(): Promise<NextResponse> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false })
    await logAuthEvent({ userId: user.id, eventType: "password_changed", success: true, authMethod: "password" })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false })
  }
}
