import { describe, it, expect } from "vitest"
import { LIVING_FLOOR, householdLivingFloorCents, residualCapacityCents } from "../livingFloor"

// The shared money-path primitive under BOTH the guarantor backstop (freeAssessment) and the flag-0b residual
// override (ruling). It was only exercised indirectly; this pins it directly so drift fails loudly here, not at
// whichever downstream test happens to sit near a tier boundary.

describe("livingFloor — sourced constants (guard against unreviewed drift)", () => {
  it("pins the PMBEJD figures + forces the citation/effective-date discipline", () => {
    // A change to these is a sourcing decision: it MUST ship with an updated effectiveMonth + citation. This guard
    // fails loudly so the figure can't be quietly "updated" with no source (the silent-drift risk we specced out).
    expect(LIVING_FLOOR.perAdultCents).toBe(350_000) // R3 500 / adult head
    expect(LIVING_FLOOR.perMinorCents).toBe(175_000) // R1 750 / minor (half an adult, 2:1)
    expect(LIVING_FLOOR.source).toBe("PMBEJD Household Affordability Index")
    expect(LIVING_FLOOR.effectiveMonth).toMatch(/^\d{4}-\d{2}$/)
    expect(LIVING_FLOOR.sourceUrl).toMatch(/^https?:\/\//)
  })
})

describe("householdLivingFloorCents", () => {
  it("sums adults + minors at the 2:1 weighting", () => {
    expect(householdLivingFloorCents(1, 0)).toBe(350_000)
    expect(householdLivingFloorCents(2, 0)).toBe(700_000)
    expect(householdLivingFloorCents(2, 1)).toBe(875_000) // 700k + 175k
    expect(householdLivingFloorCents(1, 8)).toBe(350_000 + 8 * 175_000) // R17 500 — the flag-0b "dependents raise the floor" case
  })
  it("clamps adults to ≥ 1 and minors to ≥ 0", () => {
    expect(householdLivingFloorCents(0, 0)).toBe(350_000) // always ≥ one adult head
    expect(householdLivingFloorCents(-3, -2)).toBe(350_000)
  })
})

describe("residualCapacityCents", () => {
  it("= income − obligations − living floor (one-adult default)", () => {
    expect(residualCapacityCents(2_000_000, 500_000)).toBe(2_000_000 - 500_000 - 350_000) // R11 500
  })
  it("treats missing / negative obligations as 0 (no negative-obligation boost)", () => {
    expect(residualCapacityCents(1_000_000, 0)).toBe(650_000)
    expect(residualCapacityCents(1_000_000, -999)).toBe(650_000)
  })
  it("can be negative — a stretched surety has no residual capacity", () => {
    expect(residualCapacityCents(1_000_000, 900_000)).toBe(-250_000)
  })
  it("the two entry points agree on the floor (no drift between guarantor path and flag-0b)", () => {
    // freeAssessment's guarantor path uses the 2-arg default (single adult); ruling-0b uses
    // householdLivingFloorCents(adults, minors). They must compute the SAME floor for the same household.
    const income = 3_000_000, obl = 400_000
    expect(residualCapacityCents(income, obl)).toBe(income - obl - householdLivingFloorCents(1, 0))
    expect(residualCapacityCents(income, obl, 2, 3)).toBe(income - obl - householdLivingFloorCents(2, 3))
  })
})
