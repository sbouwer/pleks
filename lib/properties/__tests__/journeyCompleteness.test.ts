/**
 * lib/properties/__tests__/journeyCompleteness.test.ts — BUILD_69 per-moment floor logic
 *
 * Locks the SSOT-driven required-floor evaluation: each moment is complete only when every required field is
 * present, durable fields read off the unit/property and per-lease off the lease/application, table-backed fields
 * (inspection profile, clauses) gated by the caller's presence flags.
 */
import { describe, it, expect } from "vitest"
import { journeyCompleteness, momentCompleteness } from "../journeyCompleteness"
import { JOURNEY_MOMENTS } from "../journeyFieldModel"

describe("journey completeness — per-moment required floor", () => {
  it("listing is complete only with asking rent + furnishing + default period", () => {
    const full = momentCompleteness("listing", {
      unit: { asking_rent_cents: 1200000, furnishing_status: "unfurnished", default_lease_period_months: 12 },
    })
    expect(full.complete).toBe(true)
    expect(full.missing).toHaveLength(0)

    const missingFurnishing = momentCompleteness("listing", {
      unit: { asking_rent_cents: 1200000, furnishing_status: null, default_lease_period_months: 12 },
    })
    expect(missingFurnishing.complete).toBe(false)
    expect(missingFurnishing.missing.map((f) => f.key)).toContain("furnishing")
  })

  it("creation needs the property address + the unit number", () => {
    const r = momentCompleteness("creation", {
      property: { address_line1: "1 Main Rd" },
      unit: { unit_number: "A1" },
    })
    expect(r.complete).toBe(true)

    const noAddress = momentCompleteness("creation", { property: { address_line1: "" }, unit: { unit_number: "A1" } })
    expect(noAddress.missing.map((f) => f.key)).toContain("address")
  })

  it("ingoing floor is gated by the durable inspection-profile presence flag", () => {
    expect(momentCompleteness("ingoing", { hasInspectionProfile: true }).complete).toBe(true)
    const none = momentCompleteness("ingoing", { hasInspectionProfile: false })
    expect(none.complete).toBe(false)
    expect(none.missing.map((f) => f.key)).toContain("inspection_profile")
  })

  it("signing needs deposit + clauses + a start date", () => {
    const complete = momentCompleteness("signing", {
      lease: { deposit_amount_cents: 1200000, start_date: "2026-07-01" },
      hasLeaseClauses: true,
    })
    expect(complete.complete).toBe(true)

    const noClauses = momentCompleteness("signing", {
      lease: { deposit_amount_cents: 1200000, start_date: "2026-07-01" },
      hasLeaseClauses: false,
    })
    expect(noClauses.missing.map((f) => f.key)).toContain("lease_clauses")
  })

  it("acceptance needs the applicant income", () => {
    expect(momentCompleteness("acceptance", { application: { gross_monthly_income_cents: 4000000 } }).complete).toBe(true)
    expect(momentCompleteness("acceptance", { application: {} }).complete).toBe(false)
  })

  it("an empty context leaves every moment incomplete", () => {
    const all = journeyCompleteness({})
    expect(all).toHaveLength(JOURNEY_MOMENTS.length)
    expect(all.every((m) => !m.complete)).toBe(true)
  })
})
