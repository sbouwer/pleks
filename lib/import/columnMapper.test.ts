/**
 * lib/import/columnMapper.test.ts — the F-8 mapping half: two columns → one field must not silently first-win
 */
import { describe, it, expect } from "vitest"
import { detectMappingCollisions } from "./columnMapper"

const map = (pairs: Record<string, string | null>) =>
  Object.fromEntries(Object.entries(pairs).map(([column, field]) => [column, { field }]))

describe("detectMappingCollisions — the F-8 regression: getField silently takes the FIRST match", () => {
  it("reports two source columns landing on one money field, first-listed as the winner", () => {
    const collisions = detectMappingCollisions(map({
      "Rent": "rent_amount_cents",
      "Monthly Rent": "rent_amount_cents",
      "Email": "email",
    }))

    expect(collisions).toEqual([
      { field: "rent_amount_cents", columns: ["Rent", "Monthly Rent"] },
    ])
  })

  it("reports every colliding column, not just the first two", () => {
    const [collision] = detectMappingCollisions(map({
      "Email": "email", "E-mail": "email", "Contact Email": "email",
    }))
    expect(collision?.columns).toEqual(["Email", "E-mail", "Contact Email"])
  })

  it("is silent when every field is mapped once", () => {
    expect(detectMappingCollisions(map({
      "Rent": "rent_amount_cents", "Deposit": "deposit_amount_cents", "Email": "email",
    }))).toEqual([])
  })

  it("does NOT cry wolf on fields that are many-to-one BY DESIGN", () => {
    // getExtraColumns aggregates every *_notes column; a TPN export legitimately ships addresstype1/2/3.
    expect(detectMappingCollisions(map({
      "Marital Status": "tenant_notes",
      "Vehicle Registration": "tenant_notes",
      "Pet Friendly": "unit_notes",
      "Water Meter": "unit_notes",
      "AddressType1": "__address_type",
      "AddressType2": "__address_type",
    }))).toEqual([])
  })

  it("ignores unmapped columns (field: null)", () => {
    expect(detectMappingCollisions(map({ "Junk A": null, "Junk B": null }))).toEqual([])
  })
})
