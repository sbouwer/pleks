/**
 * app/api/auth/clear-mfa-recovery/route.ts — clear the signed-in user's MFA recovery-pending flag
 *
 * Route:  POST /api/auth/clear-mfa-recovery
 * Auth:   Supabase session (auth.getUser); 401 when unauthenticated — the update is scoped to user.id
 * Data:   user_profiles.mfa_recovery_pending = false (service client, self-scoped)
 * Notes:  Called once MFA recovery completes. Returns 401 (not 200) without a session so the action is
 *         never silently accepted unauthenticated (Cat-8 audit correctness).
 */
import { NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"

export async function POST(): Promise<NextResponse> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false }, { status: 401 })
    const db = await createServiceClient()
    await db.from("user_profiles").update({ mfa_recovery_pending: false }).eq("id", user.id)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false })
  }
}
