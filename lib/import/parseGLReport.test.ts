/**
 * lib/import/parseGLReport.test.ts — the GL currency parser must not re-introduce the decimal-comma 100× bug
 *
 * parseTpnCurrency feeds the TRUST ledger (recordTrustTransaction, opening balances). It used to be a second,
 * independent parser whose fallback blind-stripped commas — the same census #13 bug fixed in normalise.ts.
 * It now delegates to the locale-aware SSOT; these pin that both SA shapes parse and only the pathological
 * cases degrade to 0 (never a 100× guess).
 */
import { describe, it, expect } from "vitest"
import { parseTpnCurrency } from "./parseGLReport"

describe("parseTpnCurrency — delegates to the locale-aware SSOT (no second decimal-comma bug)", () => {
  it("parses both SA locale shapes correctly (the trust-ledger 100× regression)", () => {
    expect(parseTpnCurrency("6600,50")).toBe(660050)       // af-ZA — was 66005000 (100×) before
    expect(parseTpnCurrency("R 6 600,50")).toBe(660050)    // af-ZA with R + space thousands
    expect(parseTpnCurrency("R 6,600.50")).toBe(660050)    // en-ZA (the one shape the old regex handled)
    expect(parseTpnCurrency("R 6,600.00")).toBe(660000)
  })

  it("handles negatives (GL debits) and whole rands", () => {
    expect(parseTpnCurrency("-R 1 250,00")).toBe(-125000)
    expect(parseTpnCurrency("5000")).toBe(500000)
  })

  it("degrades to 0 (not a 100× guess) on empty or genuinely ambiguous cells", () => {
    expect(parseTpnCurrency("")).toBe(0)
    expect(parseTpnCurrency("6,6600")).toBe(0)             // ambiguous — SSOT returns null → 0
    expect(parseTpnCurrency("N/A")).toBe(0)
  })
})
