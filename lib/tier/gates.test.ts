/**
 * gates.test.ts — product-line-aware tier gates (ADDENDUM_18C D-18C-02).
 *
 * Locks two invariants:
 *   NR-2: residential behaviour is byte-identical — the tier's own literal routes it to the residential
 *         maps, so every existing hasFeature/hasAccess call resolves exactly as before.
 *   D-18C-02: the HOA ladder is independent — ordinals compare WITHIN a line only; a cross-line pair is
 *         incomparable and denied (never a silent ordinal comparison across two unrelated ladders).
 */
import { describe, it, expect } from "vitest"
import { hasFeature, hasAccess } from "./gates"

describe("hasFeature — residential line (NR-2: unchanged)", () => {
  it("resolves residential features exactly as before", () => {
    expect(hasFeature("owner", "lease_create")).toBe(true)
    expect(hasFeature("owner", "bank_recon")).toBe(false) // Steward+
    expect(hasFeature("steward", "bank_recon")).toBe(true)
    expect(hasFeature("portfolio", "arrears_automation")).toBe(true)
    expect(hasFeature("firm", "hoa_module")).toBe(true) // "HOAs on the side" stays on the Firm ladder (NR-1)
    expect(hasFeature("firm", "opus_ai")).toBe(true)
  })
})

describe("hasFeature — HOA line", () => {
  it("carries the re-homed HOA + scheme-operations features at every HOA tier", () => {
    for (const t of ["hoa_studio", "hoa_practice", "hoa_firm", "hoa_bespoke"] as const) {
      expect(hasFeature(t, "hoa_module")).toBe(true)
      expect(hasFeature(t, "body_corporate")).toBe(true)
      expect(hasFeature(t, "sectional_title")).toBe(true)
      expect(hasFeature(t, "bank_recon")).toBe(true) // levy reconciliation
      expect(hasFeature(t, "opus_ai")).toBe(true) // CSOS/tribunal
    }
  })

  it("excludes rental-only features on the HOA line", () => {
    expect(hasFeature("hoa_studio", "lease_create")).toBe(false)
    expect(hasFeature("hoa_bespoke", "tenant_portal")).toBe(false)
    expect(hasFeature("hoa_firm", "application_pipeline")).toBe(false)
    expect(hasFeature("hoa_practice", "arrears_automation")).toBe(false)
    expect(hasFeature("hoa_studio", "fitscore_included")).toBe(false)
  })
})

describe("hasAccess — within-line ordinal comparison", () => {
  it("residential ladder compares as before (NR-2)", () => {
    expect(hasAccess("firm", "steward")).toBe(true)
    expect(hasAccess("steward", "steward")).toBe(true)
    expect(hasAccess("owner", "firm")).toBe(false)
    expect(hasAccess("bespoke", "portfolio")).toBe(true)
  })

  it("HOA ladder compares independently", () => {
    expect(hasAccess("hoa_practice", "hoa_studio")).toBe(true)
    expect(hasAccess("hoa_studio", "hoa_studio")).toBe(true)
    expect(hasAccess("hoa_studio", "hoa_firm")).toBe(false)
    expect(hasAccess("hoa_bespoke", "hoa_firm")).toBe(true)
  })
})

describe("hasAccess — cross-line pairs are incomparable (denied)", () => {
  it("never compares a residential tier against an HOA tier", () => {
    // A high residential tier does NOT satisfy an HOA requirement (or vice versa) — the ladders are
    // unrelated. Deny rather than compare incomparable ordinals.
    expect(hasAccess("firm", "hoa_studio")).toBe(false)
    expect(hasAccess("bespoke", "hoa_studio")).toBe(false)
    expect(hasAccess("hoa_bespoke", "owner")).toBe(false)
    expect(hasAccess("hoa_firm", "firm")).toBe(false)
  })
})
