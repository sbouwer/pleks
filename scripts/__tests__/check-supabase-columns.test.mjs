/**
 * scripts/__tests__/check-supabase-columns.test.mjs — regression-guards the column validator
 * (ADDENDUM_SCHEMA_SELECT_GUARD §2.4 / D-4). Drives the pure parser/validator against a tiny
 * fixture manifest, including the exact org-branding drift shape that motivated the guard.
 */
import { describe, it, expect } from "vitest"
import { validateSelectText, splitTopLevel } from "../check-supabase-columns.mjs"

const manifest = {
  organisations: ["id", "name", "addr_line1", "addr_city", "brand_logo_path"],
  units: ["id", "unit_number", "property_id"],
  properties: ["id", "name"],
}

describe("check-supabase-columns validator", () => {
  it("passes a select of real columns", () => {
    expect(validateSelectText("organisations", "id, name, addr_line1", manifest).violations).toEqual([])
  })

  it("flags phantom columns — the actual org-branding drift shape", () => {
    const r = validateSelectText("organisations", "name, brand_logo_url, address_line1, city", manifest)
    expect(r.violations).toEqual([
      { table: "organisations", col: "brand_logo_url" },
      { table: "organisations", col: "address_line1" },
      { table: "organisations", col: "city" },
    ])
  })

  it("validates the real column behind an alias", () => {
    expect(validateSelectText("organisations", "logo:brand_logo_path", manifest).violations).toEqual([])
    expect(validateSelectText("organisations", "logo:brand_logo_url", manifest).violations)
      .toEqual([{ table: "organisations", col: "brand_logo_url" }])
  })

  it("recurses into embeds and flags wrong embed columns", () => {
    const r = validateSelectText("units", "unit_number, properties(name, nope)", manifest)
    expect(r.violations).toEqual([{ table: "properties", col: "nope" }])
  })

  it("resolves FK-hinted / aliased embed target tables", () => {
    expect(validateSelectText("units", "prop:properties!some_fk(name)", manifest).violations).toEqual([])
  })

  it("skips *, casts, and json paths (never false-fails)", () => {
    expect(validateSelectText("organisations", "id, name::text, addr_city->>'x', *", manifest).violations).toEqual([])
  })

  it("warns (does not fail) on an embed relation absent from the manifest", () => {
    const r = validateSelectText("units", "unknown_rel(foo)", manifest)
    expect(r.violations).toEqual([])
    expect([...r.unknownTables]).toContain("unknown_rel")
  })

  it("splitTopLevel respects embed parentheses", () => {
    expect(splitTopLevel("a, b(c, d), e")).toEqual(["a", "b(c, d)", "e"])
  })
})
