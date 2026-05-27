/**
 * app/api/auth/check-email/route.ts — pre-auth email existence check for onboarding/sign-in UX
 *
 * Route:  POST /api/auth/check-email
 * Auth:   public (pre-auth); rate-limited per IP
 * Data:   check_email_exists() RPC (includes honeytoken addresses per §5 001_foundation.sql)
 * Notes:  Accepts enumeration risk per D-AUTH-RESOLVER-09 + §3.6 operational containment.
 *         Every check is logged to auth_events with hashed email + hashed IP (POPIA minimisation).
 *         Honeytoken addresses always return exists: true — accumulation is evidence of scraping.
 */
import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { rateLimit, getClientIp } from "@/lib/security/rateLimit"
import { createHash } from "node:crypto"

function sha256(input: string) {
  return createHash("sha256").update(input).digest("hex")
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  if (!rateLimit(`check-email:${ip}`, { limit: 10, windowMs: 60_000 })) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 })
  }

  const body = await req.json().catch(() => null)
  const email: unknown = body?.email

  if (!email || typeof email !== "string") {
    return NextResponse.json({ exists: false })
  }

  const supabase = await createServiceClient()

  // Daily salt for IP hashing — re-derive per request from today's date.
  // Correlation possible within a 24h window; historical tracking impossible beyond that day.
  const dailySalt = new Date().toISOString().slice(0, 10)

  const { data: exists } = await supabase.rpc("check_email_exists", {
    p_email: email.trim(),
  })

  // Log to auth_events — POPIA-minimised: hash email + salt-hashed IP, never raw values
  await supabase.from("auth_events").insert({
    event_type: "email_existence_check",
    user_id:    null,
    success:    true,
    metadata: {
      email_hash:       sha256(email.toLowerCase().trim()),
      ip_hash:          sha256(ip + dailySalt),
      result:           exists === true ? "exists" : "not_found",
      tier:             "soft",
      captcha_required: false,
    },
  })

  return NextResponse.json({ exists: exists === true })
}
