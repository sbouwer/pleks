/**
 * app/api/applications/[id]/verify/check/route.ts — verify the applicant's emailed code; stamp email_verified_at.
 *
 * Route:  POST /api/applications/[id]/verify/check   body: { token, code }
 * Auth:   PUBLIC — token-bound to the application. Rate-limited per IP + the shared OTP lockout engine.
 * Data:   consent_verifications (latest pending email_otp row) → on match, applications.email_verified_at = now.
 */
import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { rateLimit, getClientIp } from "@/lib/security/rateLimit"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { verifyCodeMatch, checkRateLimit, recordFailedAttempt, resetFailedAttempts } from "@/lib/consent/verification"

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!rateLimit(`app-verify-check:${getClientIp(req)}`, { limit: 12, windowMs: 60_000 })) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 })
  }
  const { id } = await params
  const body = await req.json().catch(() => ({})) as { token?: string; code?: string }
  if (!body.token || !body.code) return NextResponse.json({ error: "Missing code" }, { status: 400 })
  const db = await createServiceClient()

  const { data: tok, error: tokErr } = await db.from("application_tokens")
    .select("application_id").eq("token", body.token).eq("application_id", id)
    .gt("expires_at", new Date().toISOString()).maybeSingle()
  logQueryError("verify/check token", tokErr)
  if (!tok) return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 })

  const identifier = `appverify:${id}`
  const rl = await checkRateLimit(identifier)
  if (!rl.allowed) return NextResponse.json({ ok: false, status: "locked", error: rl.reason, retryAfterSeconds: rl.retryAfterSeconds }, { status: 429 })

  const { data: v, error: vErr } = await db.from("consent_verifications")
    .select("id, code_hash, code_salt, code_expires_at, status")
    .eq("application_id", id).eq("verification_method", "email_otp").eq("status", "pending")
    .order("code_sent_at", { ascending: false }).limit(1).maybeSingle()
  logQueryError("verify/check lookup", vErr)
  if (!v) return NextResponse.json({ ok: false, status: "expired" })

  if (new Date(v.code_expires_at as string) < new Date()) {
    await db.from("consent_verifications").update({ status: "expired" }).eq("id", v.id as string)
    return NextResponse.json({ ok: false, status: "expired" })
  }

  if (!verifyCodeMatch(body.code, v.code_hash as string, v.code_salt as string)) {
    await db.from("consent_verifications").update({ attempts: ((v as { attempts?: number }).attempts ?? 0) + 1 }).eq("id", v.id as string)
    await recordFailedAttempt(identifier)
    return NextResponse.json({ ok: false, status: "invalid" })
  }

  const now = new Date().toISOString()
  const { error: upVErr } = await db.from("consent_verifications").update({ status: "verified", code_verified_at: now }).eq("id", v.id as string)
  logQueryError("verify/check mark verified", upVErr)
  const { error: upAErr } = await db.from("applications").update({ email_verified_at: now }).eq("id", id)
  logQueryError("verify/check stamp application", upAErr)
  await resetFailedAttempts(identifier)

  return NextResponse.json({ ok: true, status: "verified" })
}
