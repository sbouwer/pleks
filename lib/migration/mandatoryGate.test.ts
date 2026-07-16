/**
 * lib/migration/mandatoryGate.test.ts — one gate, two behaviours (ADDENDUM_21E §1)
 *
 * Notes:  The whole invariant rests on these two lines: live-create (relax:false) THROWS on a missing field so an
 *         incomplete record can't be born outside import; import/onboarding (relax:true) lands it FLAGGED so it's
 *         on the burn-down. Same registry, one exemption.
 */
import { describe, it, expect } from "vitest"
import { mandatoryGate, MissingMandatoryFieldsError } from "./mandatoryGate"

describe("mandatoryGate — the one validated write gate", () => {
  it("relax:false REFUSES a missing field (live-create), carrying the missing set", () => {
    try {
      mandatoryGate("property", { name: "Twin Peaks" }, { relax: false })
      throw new Error("should have thrown")
    } catch (e) {
      expect(e).toBeInstanceOf(MissingMandatoryFieldsError)
      expect((e as MissingMandatoryFieldsError).missing).toEqual(["address_line1", "city", "province"])
    }
  })

  it("relax:true LANDS a missing field flagged (import/onboarding), never throws", () => {
    expect(mandatoryGate("property", { name: "Twin Peaks" }, { relax: true }))
      .toEqual({ incomplete_mandatory: ["address_line1", "city", "province"] })
  })

  it("a COMPLETE record passes either way with a null flag", () => {
    const full = { name: "X", address_line1: "1 Main", city: "CT", province: "WC" }
    expect(mandatoryGate("property", full, { relax: false })).toEqual({ incomplete_mandatory: null })
    expect(mandatoryGate("property", full, { relax: true })).toEqual({ incomplete_mandatory: null })
  })

  it("a juristic contact is not refused for a missing first name (company floor)", () => {
    expect(() => mandatoryGate("landlord", { company_name: "X Ltd", primary_email: "a@b.co", primary_phone: "0821112222" }, { relax: false }))
      .not.toThrow()
  })
})
