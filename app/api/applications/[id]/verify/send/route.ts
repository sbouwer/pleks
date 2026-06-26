/**
 * app/api/applications/[id]/verify/send/route.ts — send the applicant an email verification code (anti-bot).
 *
 * Route:  POST /api/applications/[id]/verify/send   body: { token }
 * Auth:   PUBLIC — token-bound to the application (application_tokens). Rate-limited per IP + per application
 *         via the shared consent OTP rate-limit engine.
 * Data:   consent_verifications (method 'email_otp', consent_type 'application_email') + emails the 6-digit code.
 * Notes:  Reuses the production OTP engine (lib/consent/verification). Address-verification + spam gate (a bot
 *         with a mailbox passes) — the real cost wall is that paid checks only run post-shortlist.
 */
import { NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { rateLimit, getClientIp } from "@/lib/security/rateLimit"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { generateCode, generateSalt, hashCode, checkRateLimit, recordSend } from "@/lib/consent/verification"
import { sendApplicationVerifyCode } from "@/lib/applications/emails"
import { buildBranding, fetchOrgSettings } from "@/lib/comms/send-email"

const CODE_TTL_MS = 10 * 60 * 1000

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!rateLimit(`app-verify-send:${getClientIp(req)}`, { limit: 6, windowMs: 60_000 })) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 })
  }
  const { id } = await params
  const body = await req.json().catch(() => ({})) as { token?: string; reverify?: boolean }
  if (!body.token) return NextResponse.json({ error: "Missing token" }, { status: 400 })
  const db = await createServiceClient()

  const { data: tok, error: tokErr } = await db.from("application_tokens")
    .select("application_id").eq("token", body.token).eq("application_id", id)
    .gt("expires_at", new Date().toISOString()).maybeSingle()
  logQueryError("verify/send token", tokErr)
  if (!tok) return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 })

  const { data: app, error: appErr } = await db.from("applications")
    .select("org_id, applicant_email, first_name, email_verified_at, listings(units(properties(name)))")
    .eq("id", id).maybeSingle()
  logQueryError("verify/send application", appErr)
  if (!app) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (!app.applicant_email) return NextResponse.json({ error: "No email on this application" }, { status: 400 })
  // `reverify` forces a fresh code even when already verified — the amend gate ("verify it's you" before editing
  // personal details via a shared link) must prove the CURRENT holder is the applicant, not honour a past verify.
  if (app.email_verified_at && !body.reverify) return NextResponse.json({ ok: true, alreadyVerified: true })

  const identifier = `appverify:${id}`
  const rl = await checkRateLimit(identifier)
  if (!rl.allowed) return NextResponse.json({ error: rl.reason ?? "Too many codes", retryAfterSeconds: rl.retryAfterSeconds }, { status: 429 })

  const code = generateCode()
  const salt = generateSalt()
  // Supersede any prior pending code for this application so only the newest is checkable.
  const { error: invErr } = await db.from("consent_verifications")
    .update({ status: "invalidated" })
    .eq("application_id", id).eq("verification_method", "email_otp").eq("status", "pending")
  logQueryError("verify/send invalidate prior", invErr)

  const { error: insErr } = await db.from("consent_verifications").insert({
    org_id: app.org_id as string,
    application_id: id,
    consent_type: "application_email",
    verification_method: "email_otp",
    target_email: app.applicant_email as string,
    code_hash: hashCode(code, salt),
    code_salt: salt,
    code_expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
    status: "pending",
    client_ip: getClientIp(req),
  })
  logQueryError("verify/send insert", insErr)
  if (insErr) return NextResponse.json({ error: "Could not start verification" }, { status: 500 })

  await recordSend(identifier)

  try {
    const orgId = app.org_id as string
    const { data: org, error: orgErr } = await db.from("organisations").select("name, email, phone").eq("id", orgId).single()
    logQueryError("verify/send org branding", orgErr)
    const branding = buildBranding(await fetchOrgSettings(orgId))
    await sendApplicationVerifyCode(
      { email: app.applicant_email as string, firstName: app.first_name as string | null },
      code,
      { orgId, orgName: org?.name ?? "Pleks", orgEmail: org?.email ?? undefined, orgPhone: org?.phone ?? undefined, branding },
      { applicationId: id },
    )
  } catch (e) { console.error("[verify/send] email failed:", e) }

  return NextResponse.json({ ok: true })
}
