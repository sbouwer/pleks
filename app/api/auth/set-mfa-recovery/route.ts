/**
 * app/api/auth/set-mfa-recovery/route.ts — flag the signed-in user's MFA factors as pending recovery
 *
 * Route:  POST /api/auth/set-mfa-recovery
 * Auth:   Supabase session (auth.getUser); 401 when unauthenticated — the update is scoped to user.id
 * Data:   user_profiles.mfa_recovery_pending = true (service client, self-scoped)
 * Notes:  Called from the MFA recovery flow. Returns 401 (not 200) without a session so the action is
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
    await db.from("user_profiles").update({ mfa_recovery_pending: true }).eq("id", user.id)
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false })
  }
}
