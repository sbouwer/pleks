/**
 * lib/searchworx/rates/__tests__/read.test.ts — ADDENDUM_14V §3.1: which row is a product's current rate
 *
 * Notes:  The selection is pure (`selectCurrentRates`) so it is tested without a database. §5: a product with
 *         no rows is MISSING — never a zero rate.
 */
import { describe, expect, it } from "vitest"
import { selectCurrentRates, type RateRow } from "@/lib/searchworx/rates/read"

const row = (product_key: string, cost: number, effective_date: string, source: RateRow["source"]): RateRow =>
  ({ product_key, cost_excl_vat_cents: cost, effective_date, source })

describe("selectCurrentRates", () => {
  it("takes the greatest effective_date on or before as-at", () => {
    const { rates, missing } = selectCurrentRates(
      [row("p", 100, "2026-01-01", "pricelist_import"), row("p", 200, "2026-06-01", "pricelist_import"), row("p", 300, "2026-12-01", "pricelist_import")],
      ["p"],
      "2026-10-01",
    )
    expect(missing).toEqual([])
    expect(rates.get("p")).toEqual({ productKey: "p", costExclVatCents: 200, effectiveDate: "2026-06-01" })
  })

  it("on a tie, admin_override > billing_report > pull_observed > pricelist_import", () => {
    const d = "2026-10-01"
    const all = [row("p", 1, d, "pricelist_import"), row("p", 2, d, "pull_observed"), row("p", 3, d, "billing_report"), row("p", 4, d, "admin_override")]
    expect(selectCurrentRates(all, ["p"], d).rates.get("p")?.costExclVatCents).toBe(4)
    expect(selectCurrentRates(all.slice(0, 3), ["p"], d).rates.get("p")?.costExclVatCents).toBe(3)
    expect(selectCurrentRates(all.slice(0, 2), ["p"], d).rates.get("p")?.costExclVatCents).toBe(2)
  })

  it("HIERARCHY: once billed, a newer list row never beats the billing row", () => {
    const r = selectCurrentRates([row("p", 3, "2026-09-01", "billing_report"), row("p", 1, "2026-10-01", "pricelist_import")], ["p"], "2026-10-01")
    expect(r.rates.get("p")?.costExclVatCents).toBe(3)
  })

  it("KNOWN-GOOD: the date still decides among non-list sources, and before the first billing row", () => {
    const later = [row("p", 3, "2026-09-01", "billing_report"), row("p", 5, "2026-10-01", "admin_override")]
    expect(selectCurrentRates(later, ["p"], "2026-10-01").rates.get("p")?.costExclVatCents).toBe(5)
    const unbilledYet = [row("p", 1, "2026-09-01", "pricelist_import"), row("p", 3, "2026-11-01", "billing_report")]
    expect(selectCurrentRates(unbilledYet, ["p"], "2026-10-01").rates.get("p")?.costExclVatCents).toBe(1)
  })

  it("a product with no row is MISSING, never zero", () => {
    const r = selectCurrentRates([row("p", 100, "2026-01-01", "pricelist_import")], ["p", "q"], "2026-10-01")
    expect(r.missing).toEqual(["q"])
    expect(r.rates.has("q")).toBe(false)
  })

  it("a product whose only rows are in the future is MISSING", () => {
    const r = selectCurrentRates([row("p", 100, "2027-01-01", "pricelist_import")], ["p"], "2026-10-01")
    expect(r.missing).toEqual(["p"])
  })
})
