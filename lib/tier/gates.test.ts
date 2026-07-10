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
import { hasFeature, hasAccess, tierFloorForPath, productLineForTier } from "./gates"

describe("hasFeature — residential line (NR-2: unchanged)", () => {
  it("resolves residential features exactly as before", () => {
    expect(hasFeature("owner", "lease_create")).toBe(true)
    expect(hasFeature("owner", "bank_recon")).toBe(false) // Steward+
    expect(hasFeature("steward", "bank_recon")).toBe(true)
    expect(hasFeature("portfolio", "arrears_automation")).toBe(true)
    // HOA is a STANDALONE service (2026-07-10 ruling) — never bundled into a rental-agent package.
    // "HOAs on the side" (NR-1) is retired: no residential tier carries the HOA feature literals.
    expect(hasFeature("firm", "hoa_module")).toBe(false)
    expect(hasFeature("firm", "body_corporate")).toBe(false)
    expect(hasFeature("firm", "sectional_title")).toBe(false)
    expect(hasFeature("firm", "opus_ai")).toBe(true)
  })
})

describe("hasFeature — HOA line", () => {
  it("carries the re-homed HOA + base scheme-operations features at every HOA tier", () => {
    for (const t of ["hoa_studio", "hoa_practice", "hoa_firm", "hoa_bespoke"] as const) {
      expect(hasFeature(t, "hoa_module")).toBe(true)
      expect(hasFeature(t, "body_corporate")).toBe(true)
      expect(hasFeature(t, "sectional_title")).toBe(true)
      expect(hasFeature(t, "bank_recon")).toBe(true) // levy reconciliation
      expect(hasFeature(t, "owner_statements")).toBe(true)
      expect(hasFeature(t, "ai_inspection")).toBe(true) // Sonnet but Steward-level — flat here
    }
  })

  it("gates the expensive AI / paid-pull features to hoa_firm+ (cost floor, mirrors residential)", () => {
    for (const f of ["opus_ai", "ai_full", "property_intelligence"] as const) {
      expect(hasFeature("hoa_studio", f)).toBe(false) // don't give away Opus at the bottom tier
      expect(hasFeature("hoa_practice", f)).toBe(false)
      expect(hasFeature("hoa_firm", f)).toBe(true)
      expect(hasFeature("hoa_bespoke", f)).toBe(true)
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

describe("productLineForTier — line inferred from the tier literal", () => {
  it("maps residential and HOA tiers to their lines", () => {
    expect(productLineForTier("owner")).toBe("residential")
    expect(productLineForTier("firm")).toBe("residential")
    expect(productLineForTier("bespoke")).toBe("residential")
    expect(productLineForTier("hoa_studio")).toBe("hoa")
    expect(productLineForTier("hoa_bespoke")).toBe("hoa")
  })
})

describe("tierFloorForPath — line-aware route floors", () => {
  it("residential line is unchanged (NR-2) — longest-prefix floor", () => {
    // "/hoa" has NO residential tier floor: it is product-line-gated, not tier-gated (2026-07-10 ruling).
    // A floor here would GRANT Firm orgs access — the opposite of the intent. The hard gate is in
    // app/(dashboard)/hoa/layout.tsx. Asserting null keeps anyone from "helpfully" re-adding a floor.
    expect(tierFloorForPath("/hoa")).toBeNull()
    expect(tierFloorForPath("/finance/trust-ledger")).toBe("steward")
    expect(tierFloorForPath("/settings/templates")).toBe("steward")
    expect(tierFloorForPath("/dashboard")).toBeNull() // untiered
  })

  it("HOA line has NO route floors — every HOA-surface route is reachable at the base tier", () => {
    // These would cross-line-deny an HOA org if resolved against the residential map; on the HOA line
    // they return null → no tier gate (HOA tiers gate on capacity, not route access).
    expect(tierFloorForPath("/hoa", "hoa")).toBeNull()
    expect(tierFloorForPath("/finance/trust-ledger", "hoa")).toBeNull()
    expect(tierFloorForPath("/settings/templates", "hoa")).toBeNull()
    expect(tierFloorForPath("/settings/import", "hoa")).toBeNull()
  })
})
