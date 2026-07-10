/**
 * lib/messaging/africastalking.test.ts — the sandbox-in-production guard
 *
 * Notes:  A sandbox send returns 200 and delivers nothing, so sendSMS would log status='sent' and the
 *         mandatory-comm cascade would stop retrying — a legally-required notice recorded as served
 *         without leaving the building. Unconfigured AT fails closed and is safe; sandbox credentials in
 *         production are strictly WORSE than none. These tests pin that asymmetry.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { checkAtEnvironment, AT_SANDBOX_USERNAME } from "./africastalking"

vi.mock("@sentry/nextjs", () => ({ captureMessage: vi.fn() }))

const original = process.env.VERCEL_ENV

beforeEach(() => { vi.spyOn(console, "error").mockImplementation(() => {}) })
afterEach(() => {
  if (original === undefined) delete process.env.VERCEL_ENV
  else process.env.VERCEL_ENV = original
  vi.restoreAllMocks()
})

describe("checkAtEnvironment — production", () => {
  beforeEach(() => { process.env.VERCEL_ENV = "production" })

  it("REFUSES the sandbox username", () => {
    const r = checkAtEnvironment(AT_SANDBOX_USERNAME, true)
    expect(r.ok).toBe(false)
    expect(r).toMatchObject({ reason: "sandbox_credentials_in_production" })
  })

  // The trap: whatsapp/provider resolves username from WA_USERNAME but its sandbox flag from AT_USERNAME,
  // so a LIVE username can pair with the sandbox host. The guard takes the resolved pair, not env.
  it("REFUSES a live username that targets the sandbox host", () => {
    expect(checkAtEnvironment("pleks_live", true).ok).toBe(false)
  })

  it("allows a live username on the live host", () => {
    expect(checkAtEnvironment("pleks_live", false).ok).toBe(true)
  })
})

describe("checkAtEnvironment — non-production", () => {
  it.each(["preview", undefined])("allows the sandbox when VERCEL_ENV=%s", (envValue) => {
    if (envValue === undefined) delete process.env.VERCEL_ENV
    else process.env.VERCEL_ENV = envValue
    expect(checkAtEnvironment(AT_SANDBOX_USERNAME, true).ok).toBe(true)
  })
})
