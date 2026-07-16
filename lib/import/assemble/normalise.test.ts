/**
 * lib/import/assemble/normalise.test.ts — the join keys are made comparable before matching (ADDENDUM_21C D-6)
 *
 * Notes:  The whole assembler rests on these: if two spellings of the same REFERENCE do not normalise equal, the
 *         rows silently fail to join and become orphans. So the leading-zero / whitespace / prefix cases are the
 *         load-bearing ones, and the namespace prefix must be extractable for D-5's cross-namespace guard.
 */
import { describe, it, expect } from "vitest"
import { normaliseRef, refPrefix, normaliseName, parsePartyString } from "./normalise"

describe("normaliseRef — spellings of one code compare equal", () => {
  it("strips leading zeros, whitespace and case so LEA000001 == LEA1 == ' lea 0001 '", () => {
    expect(normaliseRef("LEA000001")).toBe("LEA1")
    expect(normaliseRef("lea1")).toBe("LEA1")
    expect(normaliseRef("  LEA 000001 ")).toBe("LEA1")
    expect(normaliseRef("LEA000010")).toBe("LEA10")
  })

  it("keeps DIFFERENT codes distinct — and different namespaces never collide", () => {
    expect(normaliseRef("LEA000001")).not.toBe(normaliseRef("LEA000002"))
    expect(normaliseRef("LEA000001")).not.toBe(normaliseRef("TEN000001")) // D-5: cross-namespace
  })
})

describe("refPrefix — the namespace discriminator (D-5)", () => {
  it("extracts the letter prefix", () => {
    expect(refPrefix("LEA000001")).toBe("LEA")
    expect(refPrefix("ten000001")).toBe("TEN")
    expect(refPrefix("PRO000002")).toBe("PRO")
    expect(refPrefix("not-a-code")).toBe("")
  })
})

describe("normaliseName — mirror of identity.ts", () => {
  it("lowercases and keeps only a-z", () => {
    expect(normaliseName("Donovan Edward Farao")).toBe("donovanedwardfarao")
    expect(normaliseName("  ")).toBeNull()
    expect(normaliseName(null)).toBeNull()
  })
})

describe("parsePartyString — MRI's 'Name (phone)' lease-party string", () => {
  it("splits the household name from the parenthesised phone (E.164)", () => {
    expect(parsePartyString("Family Farao (0719780357)")).toEqual({ name: "Family Farao", phone: "+27719780357" })
  })
  it("tolerates a bare name with no phone", () => {
    expect(parsePartyString("Johan Bouwer")).toEqual({ name: "Johan Bouwer", phone: null })
  })
})
