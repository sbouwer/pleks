/**
 * lib/cron/auth.test.ts — the single cron-secret gate
 *
 * Notes:  These routes are HTTP-reachable production endpoints whose only gate is this check, so the
 *         fail-closed cases matter more than the happy path. An unset CRON_SECRET must DENY, not admit.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { requireCronAuth, isCronAuthorised, internalCronHeaders, secretMatches } from "./auth"

const SECRET = "s3cr3t-value-of-some-length"
const original = process.env.CRON_SECRET

beforeEach(() => { process.env.CRON_SECRET = SECRET })
afterEach(() => {
  if (original === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = original
})

const withHeader = (h: Record<string, string>) => new Request("https://app.pleks.co.za/api/cron/daily", { headers: h })

describe("isCronAuthorised", () => {
  it("accepts the x-cron-secret header (the cPanel standard)", () => {
    expect(isCronAuthorised(withHeader({ "x-cron-secret": SECRET }))).toBe(true)
  })

  it("accepts Authorization: Bearer", () => {
    expect(isCronAuthorised(withHeader({ authorization: `Bearer ${SECRET}` }))).toBe(true)
  })

  it("rejects a wrong secret, a missing header, and a prefix of the real secret", () => {
    expect(isCronAuthorised(withHeader({ "x-cron-secret": "wrong" }))).toBe(false)
    expect(isCronAuthorised(withHeader({}))).toBe(false)
    expect(isCronAuthorised(withHeader({ "x-cron-secret": SECRET.slice(0, -1) }))).toBe(false)
  })

  // The dangerous direction: an unset secret must never turn the gate into a pass-through.
  it("FAILS CLOSED when CRON_SECRET is unset — even if the caller sends nothing", () => {
    delete process.env.CRON_SECRET
    expect(isCronAuthorised(withHeader({}))).toBe(false)
    expect(isCronAuthorised(withHeader({ "x-cron-secret": "undefined" }))).toBe(false)
  })
})

describe("requireCronAuth", () => {
  it("returns null when authorised (the route proceeds)", () => {
    expect(requireCronAuth(withHeader({ "x-cron-secret": SECRET }))).toBeNull()
  })

  it("returns a 401 Response when not (the route returns it verbatim)", async () => {
    const res = requireCronAuth(withHeader({ "x-cron-secret": "nope" }))
    expect(res).not.toBeNull()
    expect(res!.status).toBe(401)
    await expect(res!.json()).resolves.toEqual({ error: "Unauthorized" })
  })
})

describe("secretMatches — constant-time compare", () => {
  it("is length-safe: a longer/shorter candidate returns false, never throws", () => {
    expect(secretMatches("a", "aaaaaaaa")).toBe(false)
    expect(secretMatches("aaaaaaaaaa", "aaaaaaaa")).toBe(false)
    expect(secretMatches(null, SECRET)).toBe(false)
    expect(secretMatches(undefined, SECRET)).toBe(false)
  })

  it("matches only on exact equality", () => {
    expect(secretMatches(SECRET, SECRET)).toBe(true)
    expect(secretMatches(SECRET.toUpperCase(), SECRET)).toBe(false)
  })
})

describe("internalCronHeaders", () => {
  it("carries the secret for the orchestrator's in-process children", () => {
    expect(internalCronHeaders().get("x-cron-secret")).toBe(SECRET)
  })

  // Previously `process.env.CRON_SECRET!` — an unset secret forwarded the string "undefined" to every
  // child, which then 401'd. Throwing names the real fault instead.
  it("throws when CRON_SECRET is unset rather than forwarding 'undefined'", () => {
    delete process.env.CRON_SECRET
    expect(() => internalCronHeaders()).toThrow(/CRON_SECRET is not configured/)
  })
})
