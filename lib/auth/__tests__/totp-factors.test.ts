/**
 * lib/auth/__tests__/totp-factors.test.ts — pins that the sweep reads `all`, not `totp`
 *
 * Notes: The first probe is the one that matters: it feeds a list shaped the way
 *        `listFactors()` actually shapes it (unverified factors present in `all` and ABSENT from
 *        the per-type arrays) and asserts the stale factor is found. The previous spelling,
 *        `factors.totp.filter(f => f.status !== "verified")`, returns [] against that fixture —
 *        so the fixture, not the assertion, is what makes this test able to fail.
 */
import { describe, it, expect } from "vitest"
import { staleUnverifiedTotpFactors } from "../totp-factors"

/** Mirrors `_listFactors`: everything in `all`, only VERIFIED factors in the per-type arrays. */
function asListFactorsOutput(factors: Array<{ id: string; factor_type: string; status: string }>) {
  const out: Record<string, Array<{ id: string; factor_type: string; status: string }>> = {
    all: [], phone: [], totp: [], webauthn: [],
  }
  for (const f of factors) {
    out.all.push(f)
    if (f.status === "verified") out[f.factor_type].push(f)
  }
  return out
}

describe("staleUnverifiedTotpFactors", () => {
  it("finds an unverified TOTP factor that listFactors keeps out of .totp", () => {
    const list = asListFactorsOutput([
      { id: "stale", factor_type: "totp", status: "unverified" },
    ])
    // The precondition that made the old code inert — assert it, so this stays a real probe.
    expect(list.totp).toHaveLength(0)
    expect(staleUnverifiedTotpFactors(list).map(f => f.id)).toEqual(["stale"])
  })

  it("never returns a verified factor — working MFA is not residue", () => {
    const list = asListFactorsOutput([
      { id: "good", factor_type: "totp", status: "verified" },
      { id: "stale", factor_type: "totp", status: "unverified" },
    ])
    expect(staleUnverifiedTotpFactors(list).map(f => f.id)).toEqual(["stale"])
  })

  it("ignores unverified factors of other types", () => {
    const list = asListFactorsOutput([
      { id: "wa", factor_type: "webauthn", status: "unverified" },
      { id: "ph", factor_type: "phone", status: "unverified" },
    ])
    expect(staleUnverifiedTotpFactors(list)).toEqual([])
  })

  it("returns EVERY abandoned factor, not just the one colliding on a name", () => {
    const list = asListFactorsOutput([
      { id: "a", factor_type: "totp", status: "unverified" },
      { id: "b", factor_type: "totp", status: "unverified" },
      { id: "c", factor_type: "totp", status: "verified" },
    ])
    expect(staleUnverifiedTotpFactors(list).map(f => f.id)).toEqual(["a", "b"])
  })

  it("survives null/undefined and a missing `all`", () => {
    expect(staleUnverifiedTotpFactors(null)).toEqual([])
    expect(staleUnverifiedTotpFactors(undefined)).toEqual([])
    expect(staleUnverifiedTotpFactors({})).toEqual([])
    expect(staleUnverifiedTotpFactors({ all: null })).toEqual([])
  })
})
