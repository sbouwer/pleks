/**
 * lib/consent/verification.ts — 2-step SMS consent verification primitives
 *
 * Auth:   internal — called by /api/consent/* routes (service client)
 * Data:   consent_verifications, consent_verification_rate_limits
 * Notes:  ADDENDUM_14F. Codes stored as HMAC-SHA256 with per-row salt (never
 *         plaintext). Rate limits: 3 sends/15min, 3 attempts/code, 1h soft / 24h hard.
 *         normalizePhoneZA normalises SA numbers to E.164 (+27XXXXXXXXX).
 *         F1: getHmacSecret() throws in production if env var missing (fail-loud).
 *         F3: recordSend resets consecutive_failed_codes; soft_lockout_count_24h
 *             decays after 24h via last_soft_lockout_at column.
 */

import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto"
import { createServiceClient } from "@/lib/supabase/server"
import { logQueryError } from "@/lib/supabase/logQueryError"

export type ConsentType =
  | "standard_bundle"
  | "estate_criminal"
  | "director_standard"
  | "director_estate_criminal"

export type VerificationMethod = "sms_code" | "email_link"

export interface RateLimitResult {
  allowed: boolean
  reason?: string
  retryAfterSeconds?: number
}

export interface SendResult {
  ok: boolean
  verificationId?: string
  error?: string
  rateLimited?: boolean
}

export interface VerifyResult {
  ok: boolean
  status?: "verified" | "invalid" | "locked" | "expired" | "already_verified"
  attemptsRemaining?: number
  error?: string
}

function getHmacSecret(): string {
  const secret = process.env.CONSENT_HMAC_SECRET
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("CONSENT_HMAC_SECRET env var must be set in production")
    }
    return "pleks-consent-hmac-dev"
  }
  return secret
}

const MAX_SENDS_PER_WINDOW = 3
const WINDOW_MS = 15 * 60 * 1000   // 15 min
const MAX_ATTEMPTS = 3
const SOFT_LOCKOUT_MS = 60 * 60 * 1000   // 1 hour
const HARD_LOCKOUT_MS = 24 * 60 * 60 * 1000 // 24 hours
const SOFT_LOCKOUT_THRESHOLD = 3  // soft lockouts in 24h before hard lockout

export function generateCode(): string {
  return randomInt(100000, 1000000).toString()
}

export function hashCode(code: string, salt: string): string {
  return createHmac("sha256", getHmacSecret()).update(`${salt}:${code}`).digest("hex")
}

export function verifyCodeMatch(submitted: string, storedHash: string, salt: string): boolean {
  const submittedHash = hashCode(submitted, salt)
  try {
    return timingSafeEqual(Buffer.from(submittedHash, "hex"), Buffer.from(storedHash, "hex"))
  } catch {
    return false
  }
}

export function generateSalt(): string {
  return randomBytes(16).toString("hex")
}

export function normalizePhoneZA(raw: string): string {
  const digits = raw.replace(/\D/g, "")
  if (digits.startsWith("27") && digits.length === 11) return `+${digits}`
  if (digits.startsWith("0") && digits.length === 10) return `+27${digits.slice(1)}`
  if (digits.length === 9) return `+27${digits}`
  return `+${digits}`
}

export function maskPhone(e164: string): string {
  if (e164.length < 4) return "****"
  return `****${e164.slice(-4)}`
}

export async function checkRateLimit(identifier: string): Promise<RateLimitResult> {
  const service = await createServiceClient()
  const now = new Date()

  const { data: row, error: rowError } = await service
    .from("consent_verification_rate_limits")
    .select("*")
    .eq("identifier", identifier)
    .maybeSingle()
    logQueryError("checkRateLimit consent_verification_rate_limits", rowError)

  if (!row) return { allowed: true }

  // Hard lockout check
  if (row.hard_lockout_until && new Date(row.hard_lockout_until as string) > now) {
    const retryAfterSeconds = Math.ceil((new Date(row.hard_lockout_until as string).getTime() - now.getTime()) / 1000)
    return { allowed: false, reason: "Hard lockout — too many failed attempts", retryAfterSeconds }
  }

  // Soft lockout check
  if (row.soft_lockout_until && new Date(row.soft_lockout_until as string) > now) {
    const retryAfterSeconds = Math.ceil((new Date(row.soft_lockout_until as string).getTime() - now.getTime()) / 1000)
    return { allowed: false, reason: "Too many failed codes — try again later", retryAfterSeconds }
  }

  // Window rate limit
  const windowStart = new Date(row.sends_window_start as string)
  if (now.getTime() - windowStart.getTime() < WINDOW_MS) {
    if ((row.sends_in_window as number) >= MAX_SENDS_PER_WINDOW) {
      const retryAfterSeconds = Math.ceil((windowStart.getTime() + WINDOW_MS - now.getTime()) / 1000)
      return { allowed: false, reason: "Too many codes sent — wait 15 minutes", retryAfterSeconds }
    }
  }

  return { allowed: true }
}

export async function recordSend(identifier: string): Promise<void> {
  const service = await createServiceClient()
  const now = new Date()

  const { data: existing, error: existingError } = await service
    .from("consent_verification_rate_limits")
    .select("sends_window_start, sends_in_window")
    .eq("identifier", identifier)
    .maybeSingle()
    logQueryError("recordSend consent_verification_rate_limits", existingError)

  if (!existing) {
    await service.from("consent_verification_rate_limits").insert({
      identifier,
      sends_window_start: now.toISOString(),
      sends_in_window: 1,
      updated_at: now.toISOString(),
    })
    return
  }

  const windowStart = new Date(existing.sends_window_start as string)
  const inWindow = now.getTime() - windowStart.getTime() < WINDOW_MS

  await service.from("consent_verification_rate_limits").upsert({
    identifier,
    sends_window_start:       inWindow ? existing.sends_window_start : now.toISOString(),
    sends_in_window:          inWindow ? (existing.sends_in_window as number) + 1 : 1,
    consecutive_failed_codes: 0,
    updated_at:               now.toISOString(),
  }, { onConflict: "identifier" })
}

export async function recordFailedAttempt(identifier: string): Promise<void> {
  const service = await createServiceClient()
  const now = new Date()

  const { data: existing, error: existingError } = await service
    .from("consent_verification_rate_limits")
    .select("*")
    .eq("identifier", identifier)
    .maybeSingle()
    logQueryError("recordFailedAttempt consent_verification_rate_limits", existingError)

  if (!existing) {
    await service.from("consent_verification_rate_limits").insert({
      identifier,
      sends_window_start: now.toISOString(),
      sends_in_window: 0,
      consecutive_failed_codes: 1,
      updated_at: now.toISOString(),
    })
    return
  }

  const consecutiveFailed = (existing.consecutive_failed_codes as number) + 1
  let softLockoutUntil     = existing.soft_lockout_until as string | null
  let hardLockoutUntil     = existing.hard_lockout_until as string | null
  let lastSoftLockoutAt    = existing.last_soft_lockout_at as string | null

  // Decay soft_lockout_count_24h if the last soft lockout was > 24h ago
  const rawCount = existing.soft_lockout_count_24h as number
  const decayed  = lastSoftLockoutAt && now.getTime() - new Date(lastSoftLockoutAt).getTime() > HARD_LOCKOUT_MS
  let softLockoutCount = decayed ? 0 : rawCount

  if (consecutiveFailed >= MAX_ATTEMPTS) {
    softLockoutCount++
    softLockoutUntil  = new Date(now.getTime() + SOFT_LOCKOUT_MS).toISOString()
    lastSoftLockoutAt = now.toISOString()

    if (softLockoutCount >= SOFT_LOCKOUT_THRESHOLD) {
      hardLockoutUntil = new Date(now.getTime() + HARD_LOCKOUT_MS).toISOString()
    }
  }

  await service.from("consent_verification_rate_limits").update({
    consecutive_failed_codes: consecutiveFailed,
    soft_lockout_until:       softLockoutUntil,
    hard_lockout_until:       hardLockoutUntil,
    soft_lockout_count_24h:   softLockoutCount,
    last_soft_lockout_at:     lastSoftLockoutAt,
    updated_at:               now.toISOString(),
  }).eq("identifier", identifier)
}

export async function resetFailedAttempts(identifier: string): Promise<void> {
  const service = await createServiceClient()
  await service.from("consent_verification_rate_limits").update({
    consecutive_failed_codes: 0,
    updated_at: new Date().toISOString(),
  }).eq("identifier", identifier)
}
