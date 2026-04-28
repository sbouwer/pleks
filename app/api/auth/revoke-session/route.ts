/**
 * app/api/auth/revoke-session/route.ts — Revoke a device session by fingerprint or JWT ID
 *
 * Route:  POST /api/auth/revoke-session
 * Auth:   aal1 session required; enforces user_id match — own sessions only
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { logAuthEvent } from "@/lib/auth/events"

export async function POST(req: NextRequest): Promise<NextResponse> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 })

  const body = await req.json().catch(() => ({})) as {
    deviceFingerprintId?: string
    revokeAll?: boolean
  }

  const db = await createServiceClient()

  if (body.revokeAll) {
    // Revoke all OTHER sessions — keep current one
    const { error } = await supabase.auth.signOut({ scope: "others" })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await logAuthEvent({
      userId: user.id,
      eventType: "session_revoked",
      success: true,
      metadata: { scope: "all_others" },
    })

    return NextResponse.json({ ok: true })
  }

  if (!body.deviceFingerprintId) {
    return NextResponse.json({ error: "deviceFingerprintId required" }, { status: 400 })
  }

  // Verify the fingerprint belongs to this user
  const { data: fp, error: fpErr } = await db
    .from("device_fingerprints")
    .select("id, user_id")
    .eq("id", body.deviceFingerprintId)
    .eq("user_id", user.id)
    .maybeSingle()

  if (fpErr || !fp) {
    return NextResponse.json({ error: "Device not found" }, { status: 404 })
  }

  // Soft-delete the fingerprint so future logins from this device are treated as new
  await db
    .from("device_fingerprints")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", fp.id)

  await logAuthEvent({
    userId: user.id,
    eventType: "session_revoked",
    success: true,
    metadata: { device_fingerprint_id: fp.id },
  })

  return NextResponse.json({ ok: true })
}
