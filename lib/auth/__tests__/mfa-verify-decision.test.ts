/**
 * lib/auth/__tests__/mfa-verify-decision.test.ts — FIX-70 regression guard
 *
 * Locks the /login/mfa stay-vs-enrol decision the resolver-convergence suite couldn't reach (it's a
 * client branch). The original bug: the verify page counted TOTP only, so a passkey-holder with no
 * TOTP was bounced into TOTP-only enrolment. These assert the passkey-aware decision + chooser target.
 */
import { describe, it, expect } from "vitest"
import { mfaVerifyNeedsEnrol, enrolChooserPath } from "../mfaVerifyDecision"

describe("mfaVerifyNeedsEnrol", () => {
  it("passkey present + no TOTP → stays (does NOT force enrolment)", () => {
    expect(mfaVerifyNeedsEnrol({ totpVerified: false, passkeyExists: true })).toBe(false)
  })

  it("TOTP present + no passkey → stays", () => {
    expect(mfaVerifyNeedsEnrol({ totpVerified: true, passkeyExists: false })).toBe(false)
  })

  it("both present → stays", () => {
    expect(mfaVerifyNeedsEnrol({ totpVerified: true, passkeyExists: true })).toBe(false)
  })

  it("neither present → must enrol", () => {
    expect(mfaVerifyNeedsEnrol({ totpVerified: false, passkeyExists: false })).toBe(true)
  })
})

describe("enrolChooserPath", () => {
  it("targets the chooser, never enrol-totp", () => {
    const path = enrolChooserPath("/dashboard")
    expect(path).toContain("/settings/security/enrol?")
    expect(path).not.toContain("enrol-totp")
  })

  it("carries the post-enrol destination, safe-redirect sanitised", () => {
    expect(enrolChooserPath("/properties")).toBe("/settings/security/enrol?redirect=%2Fproperties")
  })

  it("rejects auth-internal / off-origin redirects via safeRedirect (falls back to /dashboard)", () => {
    expect(enrolChooserPath("/login")).toBe("/settings/security/enrol?redirect=%2Fdashboard")
    expect(enrolChooserPath("https://evil.com")).toBe("/settings/security/enrol?redirect=%2Fdashboard")
    expect(enrolChooserPath(null)).toBe("/settings/security/enrol?redirect=%2Fdashboard")
  })

  it("prefixes mandatory=true when forced by the resolver/verify bounce", () => {
    expect(enrolChooserPath("/dashboard", { mandatory: true }))
      .toBe("/settings/security/enrol?mandatory=true&redirect=%2Fdashboard")
  })
})
