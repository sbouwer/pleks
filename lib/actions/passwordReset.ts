"use server"

/**
 * lib/actions/passwordReset.ts — rate-limited password-reset request (ADDENDUM_AUTH_HARDENING Tier-2)
 *
 * Auth:   public — no session required (it's the forgot-password entry).
 * Data:   Supabase auth.resetPasswordForEmail (server-side anon client).
 * Notes:  The forgot-password page used to call resetPasswordForEmail directly from the browser, so there was no
 *         app-level throttle on reset emails (email-bombing / reset-spam vector). This server action caps per-IP
 *         and per-email, then mirrors Supabase's behaviour of NOT revealing whether the address exists. The
 *         limiter is in-process (per the lib/security/rateLimit note) — good for single-node; swap to Upstash
 *         when multi-instance.
 */
import { headers } from "next/headers"
import { createClient } from "@/lib/supabase/server"
import { rateLimit, getClientIp } from "@/lib/security/rateLimit"

const WINDOW_MS = 15 * 60 * 1000

export async function requestPasswordReset(email: string): Promise<{ ok: true } | { error: string }> {
  const clean = email.trim().toLowerCase()
  if (!clean || !clean.includes("@")) return { error: "Enter a valid email address." }

  const h = await headers()
  const ip = getClientIp({ headers: { get: (n) => h.get(n) } })
  // Two buckets: a wider per-IP cap (stops a host hammering many addresses) and a tighter per-email cap
  // (stops bombing one inbox). Either tripping returns the generic throttle message.
  const ipOk = rateLimit(`pwreset:ip:${ip}`, { limit: 5, windowMs: WINDOW_MS })
  const emailOk = rateLimit(`pwreset:email:${clean}`, { limit: 3, windowMs: WINDOW_MS })
  if (!ipOk || !emailOk) {
    return { error: "Too many reset requests. Please wait a few minutes and try again." }
  }

  const supabase = await createClient()
  const appOrigin = process.env.NEXT_PUBLIC_APP_URL ?? ""
  // Don't surface whether the address exists — Supabase succeeds either way; we mirror that (no enumeration).
  await supabase.auth.resetPasswordForEmail(clean, { redirectTo: `${appOrigin}/reset-password` })
  return { ok: true }
}
