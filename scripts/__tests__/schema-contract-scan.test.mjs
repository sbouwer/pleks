/**
 * scripts/__tests__/schema-contract-scan.test.mjs — regression-guards the select parser of the unified
 * schema-contract scanner (ADDENDUM_SCHEMA_CONTRACT_SCREEN). Drives the pure parser against a tiny
 * fixture manifest, including the exact org-branding drift shape that motivated the original guard.
 */
import { describe, it, expect } from "vitest"
import { validateSelectText, splitTopLevel, criticality } from "../schema-contract-scan.mjs"

const tbl = {
  organisations: ["id", "name", "addr_line1", "addr_city", "brand_logo_path"],
  units: ["id", "unit_number", "property_id"],
  properties: ["id", "name"],
}

describe("schema-contract select parser", () => {
  it("passes a select of real columns", () => {
    expect(validateSelectText("organisations", "id, name, addr_line1", tbl).violations).toEqual([])
  })

  it("flags phantom columns — the actual org-branding drift shape", () => {
    const r = validateSelectText("organisations", "name, brand_logo_url, address_line1, city", tbl)
    expect(r.violations).toEqual([
      { table: "organisations", col: "brand_logo_url" },
      { table: "organisations", col: "address_line1" },
      { table: "organisations", col: "city" },
    ])
  })

  it("validates the real column behind an alias", () => {
    expect(validateSelectText("organisations", "logo:brand_logo_path", tbl).violations).toEqual([])
    expect(validateSelectText("organisations", "logo:brand_logo_url", tbl).violations)
      .toEqual([{ table: "organisations", col: "brand_logo_url" }])
  })

  it("recurses into embeds and flags wrong embed columns", () => {
    const r = validateSelectText("units", "unit_number, properties(name, nope)", tbl)
    expect(r.violations).toEqual([{ table: "properties", col: "nope" }])
  })

  it("resolves FK-hinted / aliased embed target tables", () => {
    expect(validateSelectText("units", "prop:properties!some_fk(name)", tbl).violations).toEqual([])
  })

  it("skips *, casts, and json paths (never false-fails)", () => {
    expect(validateSelectText("organisations", "id, name::text, addr_city->>'x', *", tbl).violations).toEqual([])
  })

  it("warns (does not fail) on an embed relation absent from the manifest", () => {
    const r = validateSelectText("units", "unknown_rel(foo)", tbl)
    expect(r.violations).toEqual([])
    expect([...r.unknownTables]).toContain("unknown_rel")
  })

  it("splitTopLevel respects embed parentheses", () => {
    expect(splitTopLevel("a, b(c, d), e")).toEqual(["a", "b(c, d)", "e"])
  })

  it("tags POPIA/money tables CRITICAL, access HIGH, rest NORMAL", () => {
    expect(criticality("consent_log")).toBe("CRITICAL")
    expect(criticality("trust_transactions")).toBe("CRITICAL")   // prefix
    expect(criticality("user_orgs")).toBe("HIGH")
    expect(criticality("inspections")).toBe("NORMAL")
  })
})
