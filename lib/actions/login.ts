"use server"

/**
 * lib/actions/login.ts — server-side password sign-in (ADDENDUM_AUTH_HARDENING keystone, Slice 2)
 *
 * Auth:   public (this IS the login boundary). Establishes the AAL1 session, then the login page hands off to
 *         /auth/resolver for the routing/AAL2 decision — Single-Pass: this action MUST NOT make a routing decision.
 * Data:   login_rate_limits (via loginRateLimit), auth_events (via logAuthEvent), Supabase auth (server client).
 * Notes:  Rate-limits per-IP + per-email BEFORE authenticating (lockout can't depend on a valid credential), logs
 *         BOTH outcomes server-side (login_failure with userId=null + a hashed email/IP — POPIA), fires the
 *         new-device notice on success (O-2), and returns a UNIFORM error (no account-existence enumeration).
 *         Magic-link (signInWithOtp) is unchanged — its login_success fires at /auth/callback, so no double-count.
 */
import { headers } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import { logAuthEvent } from "@/lib/auth/events"
import { maybeNotifyNewDevice } from "@/lib/auth/new-device-check"
import { hashString } from "@/lib/auth/device"
import { isLoginLocked, recordLoginFailure, resetLogin, ipIdentifier, emailIdentifier } from "@/lib/auth/loginRateLimit"

export interface LoginActionResult {
  ok: boolean
  error?: string
  lockedSec?: number
}

const UNIFORM_ERROR = "Incorrect email or password"

export async function signInWithPasswordAction(email: string, password: string): Promise<LoginActionResult> {
  const cleanEmail = email.trim()
  const h = await headers()
  const ip = h.get("x-forwarded-for")?.split(",")[0].trim() || h.get("x-real-ip") || "unknown"
  const ipId = ipIdentifier(ip)
  const emailId = await emailIdentifier(cleanEmail)

  // 1. Rate-limit BEFORE the auth attempt — a lockout must not depend on a valid credential.
  for (const id of [ipId, emailId]) {
    const lock = await isLoginLocked(id)
    if (lock.locked) {
      return { ok: false, error: "Too many attempts. Please try again later.", lockedSec: lock.retryAfterSec }
    }
  }

  // 2. Authenticate server-side — the server client writes the session cookies the resolver will read.
  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email: cleanEmail, password })

  if (error || !data.user) {
    // 3. Record the failure on both limiters + log it (no user → userId null; hash the email — POPIA).
    await recordLoginFailure(ipId)
    await recordLoginFailure(emailId)
    await logAuthEvent({
      userId: null,
      eventType: "login_failure",
      success: false,
      authMethod: "password",
      failureReason: error?.message ?? "no_user",
      metadata: { email_sha256: await hashString(cleanEmail.toLowerCase()), ip },
    })
    // 5. Uniform response — never reveal whether the email exists.
    return { ok: false, error: UNIFORM_ERROR }
  }

  // 4. Success — clear both limiters, log login_success, fire the new-device notice (O-2: its only caller).
  await resetLogin(ipId)
  await resetLogin(emailId)
  const ev = await logAuthEvent({
    userId: data.user.id,
    eventType: "login_success",
    success: true,
    authMethod: "password",
  })
  if (ev?.eventId && ev.deviceFingerprintId) {
    await maybeNotifyNewDevice({ userId: data.user.id, deviceFingerprintId: ev.deviceFingerprintId, eventId: ev.eventId })
  }

  return { ok: true }
}
