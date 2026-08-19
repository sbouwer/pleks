/**
 * lib/screening/__tests__/affordabilityThreshold.test.ts — one ceiling, answered the same way everywhere.
 *
 * The rent-to-income ceiling was stated three times with three different values-in-waiting: the org's
 * authored threshold at decision time (`applicationActions` → `screening_policies`), the platform
 * constant in the pre-screen flag, and a bare `0.30` literal in the household helper AND in the
 * applicant-facing label. An agency authoring 0.35 got a decision record certifying 0.35 while its own
 * screens flagged the applicant at 0.30 — a contradiction stamped onto the row a tribunal reads.
 *
 * These fixtures fail if any of the three stops honouring the threshold it is given. They deliberately
 * use a NON-default threshold: passing 0.30 everywhere would pass against the old literals too, which
 * is the fixture that proves nothing (L-06).
 */
import { describe, it, expect } from "vitest"
import { calculateCombinedAffordability } from "@/lib/screening/combinedAffordability"
import { calculatePreScreenScore, getPreScreenIndicator } from "@/lib/screening/preScreenScore"
import { INCOME_AFFORDABILITY_THRESHOLD } from "@/lib/constants"

// A ratio of exactly 1/3 (≈0.333): OVER the platform 0.30, UNDER an authored 0.35. Every assertion
// below distinguishes the two, so a site still hardcoding 0.30 fails.
const RENT = 10_000_00
const INCOME = 30_000_00
const RATIO = RENT / INCOME
const AUTHORED = 0.35

describe("the affordability ceiling is answered once, by the threshold it is given", () => {
  it("the fixture straddles the platform default and the authored value", () => {
    expect(RATIO).toBeGreaterThan(INCOME_AFFORDABILITY_THRESHOLD)
    expect(RATIO).toBeLessThan(AUTHORED)
  })

  describe("calculateCombinedAffordability", () => {
    it("flags against the platform default when no threshold is passed", () => {
      expect(calculateCombinedAffordability(INCOME, [], RENT).affordabilityFlag).toBe(true)
    })

    it("does NOT flag when the org authored a higher ceiling", () => {
      expect(calculateCombinedAffordability(INCOME, [], RENT, AUTHORED).affordabilityFlag).toBe(false)
    })

    it("flags when the org authored a lower ceiling", () => {
      expect(calculateCombinedAffordability(INCOME, [], RENT, 0.25).affordabilityFlag).toBe(true)
    })

    it("cannot flag when there is no income to divide by", () => {
      expect(calculateCombinedAffordability(0, [], RENT, AUTHORED).ratio).toBeNull()
      expect(calculateCombinedAffordability(0, [], RENT, AUTHORED).affordabilityFlag).toBe(false)
    })
  })

  describe("calculatePreScreenScore", () => {
    it("flags against the platform default when no threshold is passed", () => {
      expect(calculatePreScreenScore(INCOME, RENT, "permanent", 0).affordabilityFlag).toBe(true)
    })

    it("does NOT flag when the org authored a higher ceiling", () => {
      expect(calculatePreScreenScore(INCOME, RENT, "permanent", 0, AUTHORED).affordabilityFlag).toBe(false)
    })

    it("leaves the income SUB-SCORE curve fixed — it is not the ceiling", () => {
      // The 0.25/0.30/0.35/0.40 ladder decides how much of 25 points the ratio earns. Threading the
      // org threshold into one rung would let the rungs cross, so it stays put: same score either way.
      const a = calculatePreScreenScore(INCOME, RENT, "permanent", 0)
      const b = calculatePreScreenScore(INCOME, RENT, "permanent", 0, AUTHORED)
      expect(b.incomeScore).toBe(a.incomeScore)
      expect(b.prescreenScore).toBe(a.prescreenScore)
    })
  })

  describe("getPreScreenIndicator — the label the applicant reads", () => {
    it("says insufficient/borderline against the platform default", () => {
      expect(getPreScreenIndicator(RATIO)).toBe("borderline")
    })

    it("says strong when the org authored a ceiling above the ratio", () => {
      expect(getPreScreenIndicator(RATIO, AUTHORED)).toBe("strong")
    })

    it("agrees with the flag: the label and the flag key on the SAME threshold", () => {
      for (const t of [0.25, 0.3, 0.35]) {
        const flagged = calculatePreScreenScore(INCOME, RENT, "permanent", 0, t).affordabilityFlag
        const strong = getPreScreenIndicator(RATIO, t) === "strong"
        expect(strong).toBe(!flagged)
      }
    })

    it("is pending with no ratio, whatever the threshold", () => {
      expect(getPreScreenIndicator(null, AUTHORED)).toBe("pending")
    })
  })
})
