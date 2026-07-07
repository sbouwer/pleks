/**
 * lib/ai/rateLimit.ts — durable fixed-window rate limit for expensive AI routes (denial-of-wallet guard)
 *
 * Auth:   service-role only — bump_ai_rate_limit is REVOKEd from anon/authenticated + the table is RLS-deny-all.
 * Data:   ai_rate_limits via the bump_ai_rate_limit RPC (atomic INSERT … ON CONFLICT increment; prunes old windows).
 * Notes:  Fail-OPEN on a limiter error — a DB blip must never lock a legitimate applicant out of screening. Scope
 *         keys are per-route + per-subject (e.g. `detect-document:{applicationId}`) so one caller can't exhaust
 *         another's budget. Fixed-window (not sliding) — cheap + good enough to cap denial-of-wallet abuse.
 */
import type { SupabaseClient } from "@supabase/supabase-js"

export interface RateLimitResult {
  allowed: boolean
  count: number
}

/** Bump the fixed-window counter for `scopeKey` and report whether the caller is within `limit` per `windowMinutes`. */
export async function checkAiRateLimit(
  db: SupabaseClient,
  scopeKey: string,
  limit: number,
  windowMinutes: number,
): Promise<RateLimitResult> {
  const windowMs = windowMinutes * 60_000
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs).toISOString()
  const { data, error } = await db.rpc("bump_ai_rate_limit", { p_scope_key: scopeKey, p_window_start: windowStart })
  if (error) {
    console.error(`[ai-rate-limit] bump failed for ${scopeKey} (failing open):`, error.message)
    return { allowed: true, count: 0 } // fail-open — never block a legit user on a limiter infra error
  }
  const count = (data as number) ?? 0
  return { allowed: count <= limit, count }
}
