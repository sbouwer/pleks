/**
 * lib/searchworx/rates/__tests__/priceListFile.test.ts — the vendor's .xls price list reads exactly as its CSV does
 *
 * Notes:  `pricelist_default_2026-10-01.xls` is the vendor file as downloaded (two tabs: the list, and a
 *         PricingCategory/EffectiveDate metadata tab). Built workbooks cover the shapes it does not: .xlsx, numeric
 *         price cells formatted as currency, and the refusals. Probed both ways: the same mapped products and cents
 *         as the CSV; the metadata tab is read, not dropped; an unknown tab or a second list refuses the workbook.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import * as XLSX from "xlsx"
import { priceListSheetText } from "@/lib/searchworx/rates/priceListFile"
import { parsePriceList } from "@/lib/searchworx/rates/priceList"

const FIX = join(__dirname, "../__fixtures__")
const CSV = readFileSync(join(FIX, "pricelist_default_2026-10-01.csv"), "utf8")
const XLS = new Uint8Array(readFileSync(join(FIX, "pricelist_default_2026-10-01.xls")))

const META_TAB = [
  ["Pricing is excluding Value Added Tax. / E&OE", ""],
  ["PricingCategory", "EffectiveDate"],
  ["STANDARD", "20/04/2026 15:13:21"],
]

/** The list as numeric price cells — the shape the vendor file does NOT use, so it is covered here. */
function numericListRows(): unknown[][] {
  const wb = XLSX.read(CSV, { type: "string", raw: true })
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "", raw: true })
  return rows.map((r) => r.map((c) => (typeof c === "string" && /^\d+(\.\d+)?$/.test(c) ? Number(c) : c)))
}

function workbook(tabs: Record<string, unknown[][]>, bookType: XLSX.BookType, numberFormat?: string): Uint8Array {
  const wb = XLSX.utils.book_new()
  for (const [name, rows] of Object.entries(tabs)) {
    const ws = XLSX.utils.aoa_to_sheet(rows)
    if (numberFormat) {
      for (const cell of Object.values(ws)) {
        if (cell && typeof cell === "object" && (cell as XLSX.CellObject).t === "n") (cell as XLSX.CellObject).z = numberFormat
      }
    }
    XLSX.utils.book_append_sheet(wb, ws, name)
  }
  return new Uint8Array(XLSX.write(wb, { bookType, type: "array" }) as ArrayBuffer)
}

const summary = (text: string) => {
  const r = parsePriceList(text)
  return { mapped: r.mapped.map((m) => [m.productKey, m.cents, m.confidence]), unmapped: r.unmapped.length, rejected: r.rejected }
}
const fromCsv = summary(CSV)

describe("priceListSheetText — the vendor file", () => {
  it("reads exactly as the CSV, and returns the vendor's own effective date", () => {
    const r = priceListSheetText(XLS, XLSX)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(fromCsv.mapped.length).toBeGreaterThan(0)
    expect(summary(r.text)).toEqual(fromCsv)
    expect(r.meta).toEqual({ category: "STANDARD", effectiveDate: "2026-04-20", effectiveDateText: "20/04/2026 15:13:21" })
  })
})

describe("priceListSheetText — shapes the vendor file does not cover", () => {
  it.each(["biff8", "xlsx"] as const)("a %s list with NUMERIC prices, even currency-formatted, reads as the CSV", (bookType) => {
    const r = priceListSheetText(workbook({ List: numericListRows(), Meta: META_TAB }, bookType, '"R "0.00'), XLSX)
    expect(r.ok && summary(r.text)).toEqual(fromCsv)
  })

  it("KNOWN-GOOD: a list with no metadata tab, and a blank spacer tab, read fine", () => {
    const r = priceListSheetText(workbook({ List: numericListRows(), Sheet2: [] }, "biff8"), XLSX)
    expect(r).toMatchObject({ ok: true, meta: null })
  })

  it("an unreadable vendor date is returned as text, never guessed", () => {
    const bad = [META_TAB[0], META_TAB[1], ["STANDARD", "31/02/2026"]]
    const r = priceListSheetText(workbook({ List: numericListRows(), Meta: bad }, "biff8"), XLSX)
    expect(r.ok && r.meta).toEqual({ category: "STANDARD", effectiveDate: null, effectiveDateText: "31/02/2026" })
  })

  it("PLANTED: a tab this import does not know refuses the whole workbook", () => {
    const r = priceListSheetText(workbook({ List: numericListRows(), Meta: META_TAB, Notes: [["anything"]] }, "biff8"), XLSX)
    expect(r).toEqual({ ok: false, error: expect.stringContaining("(Notes)") })
  })

  it("PLANTED: two list tabs refuse — neither is picked", () => {
    const r = priceListSheetText(workbook({ A: numericListRows(), B: numericListRows() }, "biff8"), XLSX)
    expect(r).toEqual({ ok: false, error: expect.stringContaining("found 2") })
  })

  it("PLANTED: no list tab, or an empty workbook, refuses", () => {
    expect(priceListSheetText(workbook({ Meta: META_TAB }, "biff8"), XLSX)).toMatchObject({ ok: false })
    expect(priceListSheetText(workbook({ Sheet1: [] }, "biff8"), XLSX)).toEqual({ ok: false, error: "the workbook has no data" })
  })
})
