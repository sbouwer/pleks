/**
 * lib/screening/__tests__/bundle-economics.test.ts — the screening fee must never drift from its cost basis
 *
 * Notes:  This is the CI defence for the fee/cost SSOT. Two failures it exists to catch:
 *
 *         1. STALE COST DATA. searchworxBundle.ts previously carried hand-maintained BUNDLE_COST_*
 *            totals for a bundle composition retired on 2026-05-18. Nothing imported the file, so
 *            nothing noticed for three months — until it was read as authoritative and produced the
 *            false conclusion that the R250 fee was below cost.
 *         2. SELLING BELOW COST. If a fee is cut or a bureau raises a line item, the margin assertions
 *            fail before it ships.
 *
 *         The expected values below are transcribed from brief/legal/SEARCHWORX_RATE_CARD.md §1.1.
 *         If a line-item cost legitimately changes, this test SHOULD fail — amend the rate card and
 *         these expectations in the same change-set. That coupling is the point, not an inconvenience.
 */
import { describe, it, expect } from "vitest"
import { APPLICATION_FEE_CENTS, JOINT_APPLICATION_FEE_CENTS } from "@/lib/constants"
import {
  SEARCHWORX_BUNDLE_SA,
  SEARCHWORX_BUNDLE_FOREIGN,
  bundleCostExclVatCents,
  bundleCostInclVatCents,
  screeningMarginCents,
  getRequiredChecks,
  VAT_RATE,
} from "@/lib/screening/searchworxBundle"

// ── Rate card §1.1, amended 2026-05-18 ───────────────────────────────────────
const RATE_CARD = {
  combinedReportExclVat: 17000, // R170.00
  vccbExclVat:             635, // R6.35
  bundleExclVat:         17635, // R176.35
  bundleInclVat:         20280, // R202.80 — Pleks's actual cost
  marginAt250:            4720, // R47.20 (19%)
  feeSingle:             25000, // R250
} as const

describe("bundle composition matches the rate card", () => {
  it("is the post-2026-05-18 Combined call, not the retired per-bureau bundle", () => {
    expect(getRequiredChecks(false)).toEqual(["COMBINED_CONSUMER_CREDIT_REPORT", "VCCB_INCOME_ESTIMATOR"])
    // Default Listing was retired permanently; its presence means the file has regressed.
    expect(getRequiredChecks(false)).not.toContain("DEFAULT_LISTING_CONSUMER_COMBINED")
  })

  it("prices each line item at the rate-card figure", () => {
    const byCode = Object.fromEntries(SEARCHWORX_BUNDLE_SA.map((c) => [c.check_code, c.cost_excl_vat_cents]))
    expect(byCode.COMBINED_CONSUMER_CREDIT_REPORT).toBe(RATE_CARD.combinedReportExclVat)
    expect(byCode.VCCB_INCOME_ESTIMATOR).toBe(RATE_CARD.vccbExclVat)
  })

  it("omits the VCCB income estimator for foreign nationals (SA citizens only)", () => {
    expect(getRequiredChecks(true)).toEqual(["COMBINED_CONSUMER_CREDIT_REPORT"])
    expect(SEARCHWORX_BUNDLE_FOREIGN).toHaveLength(SEARCHWORX_BUNDLE_SA.length - 1)
  })
})

describe("derived totals equal the published rate-card totals", () => {
  it("derives the ex-VAT bundle cost", () => {
    expect(bundleCostExclVatCents(false)).toBe(RATE_CARD.bundleExclVat)
  })

  it("derives the incl-VAT bundle cost — Pleks's actual cost", () => {
    expect(bundleCostInclVatCents(false)).toBe(RATE_CARD.bundleInclVat)
  })

  it("applies SA VAT at 15%", () => {
    expect(VAT_RATE).toBe(0.15)
  })
})

describe("no bundle is ever sold below cost", () => {
  it("charges R250 for a single application", () => {
    expect(APPLICATION_FEE_CENTS).toBe(RATE_CARD.feeSingle)
  })

  it("earns the rate card's stated margin on a single SA application", () => {
    expect(screeningMarginCents(false)).toBe(RATE_CARD.marginAt250)
  })

  it("keeps every combination profitable", () => {
    for (const isJoint of [false, true]) {
      for (const isForeign of [false, true]) {
        const margin = screeningMarginCents(isJoint, isForeign)
        expect(margin, `joint=${isJoint} foreign=${isForeign} margin=${margin}c`).toBeGreaterThan(0)
      }
    }
  })

  it("covers TWO bundles on a joint application", () => {
    // A joint application screens both applicants, so it consumes two bundles — the joint fee must
    // clear 2x cost, not 1x. This is the assertion that catches "joint looked like a nice discount".
    expect(JOINT_APPLICATION_FEE_CENTS).toBeGreaterThan(bundleCostInclVatCents(false) * 2)
  })
})
