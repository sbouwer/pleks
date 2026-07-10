/**
 * lib/env.test.ts — the env centre fails CLOSED and names what is missing
 *
 * The point of the module is that a missing var is a NAMED error at the boundary, not `undefined` surfacing
 * three calls deeper (the June-outage mechanic). These tests pin that behaviour so a future "just return
 * the value" simplification can't quietly reopen it.
 */
import { describe, it, expect, afterEach, vi } from "vitest"
import { requireEnv, optionalEnv, assertRequiredEnv, isProductionRuntime } from "./env"

const ORIGINAL = { ...process.env }
afterEach(() => {
  process.env = { ...ORIGINAL }
  vi.unstubAllEnvs()
})

describe("requireEnv — throws a named error when a required var is absent", () => {
  it("names the variable and its purpose", () => {
    vi.stubEnv("RESEND_API_KEY", "")
    expect(() => requireEnv("RESEND_API_KEY")).toThrow(/RESEND_API_KEY/)
    expect(() => requireEnv("RESEND_API_KEY")).toThrow(/transactional email/)
  })

  it("returns the value when set", () => {
    vi.stubEnv("RESEND_API_KEY", "re_live_abc")
    expect(requireEnv("RESEND_API_KEY")).toBe("re_live_abc")
  })

  it("treats an empty string as absent (a set-but-blank var is the same outage)", () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "")
    expect(() => requireEnv("SUPABASE_SERVICE_ROLE_KEY")).toThrow(/Missing required/)
  })
})

describe("optionalEnv — never throws, honours the fallback", () => {
  it("returns the fallback when unset", () => {
    vi.stubEnv("ADMIN_EMAIL", "")
    expect(optionalEnv("ADMIN_EMAIL", "ops@pleks.co.za")).toBe("ops@pleks.co.za")
    expect(optionalEnv("ADMIN_EMAIL")).toBe("")
  })

  it("returns the value when set", () => {
    vi.stubEnv("ADMIN_EMAIL", "a@b.co")
    expect(optionalEnv("ADMIN_EMAIL")).toBe("a@b.co")
  })
})

describe("assertRequiredEnv — the health/startup preflight", () => {
  it("only asserts in a production runtime — dev/preview may run without the full secret set", () => {
    vi.stubEnv("VERCEL_ENV", "preview")
    vi.stubEnv("RESEND_API_KEY", "")
    expect(assertRequiredEnv()).toEqual({ ok: true, missing: [] })
  })

  it("reports the missing prod-required vars by name", () => {
    vi.stubEnv("VERCEL_ENV", "production")
    vi.stubEnv("RESEND_API_KEY", "")
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "set")
    const r = assertRequiredEnv()
    expect(r.ok).toBe(false)
    expect(r.missing).toContain("RESEND_API_KEY")
    expect(r.missing).not.toContain("SUPABASE_SERVICE_ROLE_KEY")
  })

  it("is green when every prod-required var is present", () => {
    vi.stubEnv("VERCEL_ENV", "production")
    for (const name of [
      "SUPABASE_SERVICE_ROLE_KEY", "RESEND_API_KEY", "ANTHROPIC_API_KEY", "CRON_SECRET",
      "ENCRYPTION_KEY", "ID_NUMBER_HASH_SALT", "PASSKEY_AAL_SECRET", "CONSENT_HMAC_SECRET", "ADMIN_SECRET",
    ]) {
      vi.stubEnv(name, "present")
    }
    expect(assertRequiredEnv()).toEqual({ ok: true, missing: [] })
  })
})

describe("isProductionRuntime", () => {
  it("is true only on Vercel production", () => {
    vi.stubEnv("VERCEL_ENV", "production")
    expect(isProductionRuntime()).toBe(true)
    vi.stubEnv("VERCEL_ENV", "preview")
    expect(isProductionRuntime()).toBe(false)
    vi.stubEnv("VERCEL_ENV", "")
    expect(isProductionRuntime()).toBe(false)
  })
})
