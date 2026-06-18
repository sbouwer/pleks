import { describe, it, expect } from "vitest"
import { isSubstantiveText, MIN_SUBSTANTIVE_TEXT_LENGTH } from "../substantive"

describe("isSubstantiveText (O-16 R3 guard)", () => {
  it("rejects null/undefined/empty/whitespace (what a presence check would let through)", () => {
    expect(isSubstantiveText(null)).toBe(false)
    expect(isSubstantiveText(undefined)).toBe(false)
    expect(isSubstantiveText("")).toBe(false)
    expect(isSubstantiveText("     ")).toBe(false)
  })

  it("rejects a token value that is truthy but not substantive", () => {
    expect(isSubstantiveText("x")).toBe(false)
    expect(isSubstantiveText("n/a")).toBe(false)
  })

  it("accepts a real explanation past the minimum length", () => {
    expect(isSubstantiveText("Request refused under POPIA s23(2)(a) — disproportionate effort.")).toBe(true)
  })

  it("counts characters after trimming, at the boundary", () => {
    const exact = "a".repeat(MIN_SUBSTANTIVE_TEXT_LENGTH)
    expect(isSubstantiveText(`  ${exact}  `)).toBe(true)
    expect(isSubstantiveText("a".repeat(MIN_SUBSTANTIVE_TEXT_LENGTH - 1))).toBe(false)
  })
})
