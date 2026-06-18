/**
 * app/api/auth/log-totp-enrolled/route.ts — audit-log a successful TOTP enrolment for the user
 *
 * Route:  POST /api/auth/log-totp-enrolled
 * Auth:   Supabase session (auth.getUser); 401 when unauthenticated — the event is logged for user.id
 * Data:   logAuthEvent (auth_events) — totp_enrolled
 * Notes:  Fire-and-forget from the enrolment step. Returns 401 (not 200) without a session so the log
 *         action is never silently accepted unauthenticated (Cat-8 audit correctness).
 */
import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { logAuthEvent } from "@/lib/auth/events"

export async function POST(): Promise<NextResponse> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false }, { status: 401 })
    await logAuthEvent({ userId: user.id, eventType: "totp_enrolled", success: true })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false })
  }
}
