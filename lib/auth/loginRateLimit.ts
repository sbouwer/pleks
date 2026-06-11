/**
 * lib/auth/loginRateLimit.ts — durable per-IP + per-email login throttle (ADDENDUM_AUTH_HARDENING keystone)
 *
 * Notes: backed by login_rate_limits (service-role only), so a lockout survives Vercel multi-instance — unlike
 *        the in-memory forgot-password limiter. The login server action (Slice 2) checks BOTH an "ip:<addr>" and
 *        an "email:<sha256>" identifier BEFORE authenticating (lockout must not depend on a valid credential),
 *        records a failure on both, and resets both on success. Email is hashed (POPIA — never store plaintext).
 *        Read-modify-write is fine here: per-identifier login concurrency is low.
 */
import { createServiceClient } from "@/lib/supabase/server"
import { hashString } from "@/lib/auth/device"

const WINDOW_MS  = 15 * 60 * 1000   // sliding window for the attempt counter
const MAX_FAILS  = 5                // consecutive failures (per identifier) before lockout
const LOCKOUT_MS = 15 * 60 * 1000   // lockout duration once MAX_FAILS is hit

export function ipIdentifier(ip: string): string {
  return `ip:${ip}`
}

export async function emailIdentifier(email: string): Promise<string> {
  return `email:${await hashString(email.trim().toLowerCase())}`
}

/** Whether this identifier is currently locked out, and for how many more seconds. */
export async function isLoginLocked(identifier: string): Promise<{ locked: boolean; retryAfterSec: number }> {
  const db = await createServiceClient()
  const { data, error } = await db
    .from("login_rate_limits")
    .select("locked_until")
    .eq("identifier", identifier)
    .maybeSingle()
  if (error) {
    console.error("[loginRateLimit] lookup failed:", error.message)
    return { locked: false, retryAfterSec: 0 } // fail-open on a limiter read error — never wall a valid login out
  }
  if (!data?.locked_until) return { locked: false, retryAfterSec: 0 }
  const ms = new Date(data.locked_until).getTime() - Date.now()
  return ms > 0 ? { locked: true, retryAfterSec: Math.ceil(ms / 1000) } : { locked: false, retryAfterSec: 0 }
}

/** Record a failed login; lock once MAX_FAILS consecutive failures hit. Returns the remaining attempts + lock. */
export async function recordLoginFailure(identifier: string): Promise<{ attemptsLeft: number; locked: boolean }> {
  const db = await createServiceClient()
  const now = Date.now()
  const { data, error } = await db
    .from("login_rate_limits")
    .select("window_start, attempts_in_window, consecutive_failures, locked_until")
    .eq("identifier", identifier)
    .maybeSingle()
  if (error) console.error("[loginRateLimit] failure read failed:", error.message)

  const windowExpired = !data || now - new Date(data.window_start).getTime() > WINDOW_MS
  const consecutive = (data?.consecutive_failures ?? 0) + 1
  const locked = consecutive >= MAX_FAILS

  await db.from("login_rate_limits").upsert(
    {
      identifier,
      window_start:         windowExpired ? new Date(now).toISOString() : data!.window_start,
      attempts_in_window:   windowExpired ? 1 : data!.attempts_in_window + 1,
      consecutive_failures: consecutive,
      locked_until:         locked ? new Date(now + LOCKOUT_MS).toISOString() : (data?.locked_until ?? null),
      updated_at:           new Date(now).toISOString(),
    },
    { onConflict: "identifier" },
  )

  return { attemptsLeft: Math.max(0, MAX_FAILS - consecutive), locked }
}

/** Clear the failure streak + lockout for an identifier on a successful sign-in (keeps the table self-cleaning). */
export async function resetLogin(identifier: string): Promise<void> {
  const db = await createServiceClient()
  // eslint-disable-next-line pleks/require-scope-on-delete -- login_rate_limits is platform-level (no org_id); reset by PK identifier
  await db.from("login_rate_limits").delete().eq("identifier", identifier)
}
