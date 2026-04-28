import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { logAuthEvent } from "@/lib/auth/events"

export async function POST(): Promise<NextResponse> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ ok: false })
    await logAuthEvent({ userId: user.id, eventType: "totp_enrolled", success: true })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false })
  }
}
