/**
 * lib/properties/__tests__/propertyLabel.test.ts — the unit/property display-label SSOT
 *
 * Pins the behaviour the ~100 inline concats depended on: "unit, property" with both parts, a chosen
 * separator/fallback, PostgREST array-or-object embeds, and graceful degradation — so a migration that
 * routes a site through formatPropertyLabel can never silently change the rendered string.
 */
import { describe, it, expect } from "vitest"
import type { SupabaseClient } from "@supabase/supabase-js"
import { formatPropertyLabel, resolvePropertyLabel } from "../propertyLabel"

describe("formatPropertyLabel", () => {
  it("joins unit number + property name with the default ', ' separator", () => {
    expect(formatPropertyLabel({ unit_number: "5", properties: { name: "Sea Point Villa" } })).toBe("5, Sea Point Villa")
  })

  it("honours a custom separator (the leases surface uses ' — ')", () => {
    expect(formatPropertyLabel({ unit_number: "5", properties: { name: "Sea Point Villa" } }, { separator: " — " })).toBe("5 — Sea Point Villa")
  })

  it("returns the default fallback for a null/undefined unit", () => {
    expect(formatPropertyLabel(null)).toBe("your property")
    expect(formatPropertyLabel(undefined)).toBe("your property")
  })

  it("honours a custom fallback", () => {
    expect(formatPropertyLabel(null, { fallback: "—" })).toBe("—")
    expect(formatPropertyLabel(null, { fallback: "" })).toBe("")
  })

  it("takes the first row when PostgREST types the embed as an array", () => {
    expect(formatPropertyLabel({ unit_number: "12B", properties: [{ name: "Bo-Kaap Lofts" }] })).toBe("12B, Bo-Kaap Lofts")
  })

  it("degrades to whichever part exists instead of emitting 'undefined'", () => {
    expect(formatPropertyLabel({ unit_number: "7", properties: null })).toBe("7")
    expect(formatPropertyLabel({ properties: { name: "Table View Court" } })).toBe("Table View Court")
    expect(formatPropertyLabel({ unit_number: "", properties: { name: "" } })).toBe("your property")
  })
})

/** Minimal units→select→eq→maybeSingle mock returning a row / null / an error. */
function makeUnitDb(result: { data?: unknown; error?: boolean }): SupabaseClient {
  const maybeSingle = () => Promise.resolve(
    result.error ? { data: null, error: { message: "boom" } } : { data: result.data ?? null, error: null },
  )
  return {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
  } as unknown as SupabaseClient
}

describe("resolvePropertyLabel", () => {
  it("returns the fallback WITHOUT querying when the unitId is absent", async () => {
    let queried = false
    const db = { from: () => { queried = true; return {} } } as unknown as SupabaseClient
    expect(await resolvePropertyLabel(db, null, { fallback: "the property" })).toBe("the property")
    expect(queried).toBe(false)
  })

  it("formats a fetched unit row", async () => {
    const db = makeUnitDb({ data: { unit_number: "3", properties: { name: "Green Point Mews" } } })
    expect(await resolvePropertyLabel(db, "unit-1")).toBe("3, Green Point Mews")
  })

  it("returns the fallback on not-found or query error (never throws)", async () => {
    expect(await resolvePropertyLabel(makeUnitDb({ data: null }), "u", { fallback: "your property" })).toBe("your property")
    expect(await resolvePropertyLabel(makeUnitDb({ error: true }), "u", { fallback: "your property" })).toBe("your property")
  })
})
