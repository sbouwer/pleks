import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { rateLimit, getClientIp } from "@/lib/security/rateLimit"

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  if (!rateLimit(`check-email:${ip}`, { limit: 10, windowMs: 60_000 })) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 })
  }

  const { email } = await req.json()

  if (!email || typeof email !== "string") {
    return NextResponse.json({ exists: false })
  }

  const supabase = await createServiceClient()
  const { data } = await supabase.rpc("check_email_exists", {
    p_email: email.trim(),
  })

  return NextResponse.json({ exists: data === true })
}
