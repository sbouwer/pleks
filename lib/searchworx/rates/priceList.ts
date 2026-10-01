/**
 * lib/searchworx/rates/priceList.ts — parses the Searchworx price-list export and maps it to product keys (ADDENDUM_14V §3.2)
 *
 * Data:   none — pure. Input is the two-column `Search Type,Price` sheet (ex VAT, rands with two decimals),
 *         preceded by free-text preamble rows; output is mapped rows, unmapped names, and rejected lines.
 * Notes:  Prices are parsed as text, never through a float: "17.70" → 1770 by splitting on the point, so a
 *         binary-fraction rounding error cannot move a vendor price by a cent. A line that is not a clean
 *         `name,price` pair after the header is REJECTED and reported, not skipped silently — a truncated or
 *         reshuffled export must be visible (§9.2).
 */
import { VENDOR_NAME_TO_PRODUCT_KEY } from "@/lib/searchworx/rates/productNames"

export interface PriceListRow {
  line: number
  name: string
  cents: number
}

export interface MappedPrice extends PriceListRow {
  productKey: string
}

export interface PriceListReport {
  mapped: MappedPrice[]
  unmapped: PriceListRow[]
  rejected: { line: number; text: string; reason: string }[]
}

const HEADER = /^search type\s*,\s*price\s*$/i
const PRICE = /^(\d{1,7})(?:\.(\d{1,2}))?$/

/** "17.70" → 1770; "17.7" → 1770; "17" → 1700. Null for anything else. */
export function priceToCents(text: string): number | null {
  const m = PRICE.exec(text.trim())
  if (!m) return null
  return Number(m[1]) * 100 + Number((m[2] ?? "0").padEnd(2, "0"))
}

/** Split a CSV line on its LAST comma: names carry no commas in this export, prices never do. */
function splitRow(raw: string): [string, string] | null {
  const i = raw.lastIndexOf(",")
  if (i < 0) return null
  const unquote = (s: string) => s.trim().replace(/^"(.*)"$/, "$1").replaceAll('""', '"')
  return [unquote(raw.slice(0, i)), raw.slice(i + 1).trim()]
}

export function parsePriceList(text: string): PriceListReport {
  const report: PriceListReport = { mapped: [], unmapped: [], rejected: [] }
  const lines = text.split(/\r?\n/)
  const headerAt = lines.findIndex((l) => HEADER.test(l.trim()))
  if (headerAt < 0) {
    report.rejected.push({ line: 0, text: "", reason: "no `Search Type,Price` header — not a Searchworx price list" })
    return report
  }

  const seen = new Map<string, number>()
  for (let i = headerAt + 1; i < lines.length; i++) {
    const raw = lines[i]
    if (raw.trim() === "") continue
    const line = i + 1
    const cells = splitRow(raw)
    const cents = cells ? priceToCents(cells[1]) : null
    if (!cells || !cells[0] || cents === null) {
      report.rejected.push({ line, text: raw, reason: "not a `name,price` row" })
      continue
    }
    const row: PriceListRow = { line, name: cells[0], cents }
    const productKey = VENDOR_NAME_TO_PRODUCT_KEY[row.name]
    if (!productKey) {
      report.unmapped.push(row)
      continue
    }
    const prior = seen.get(productKey)
    if (prior !== undefined) {
      report.rejected.push({ line, text: raw, reason: `second price for ${productKey} (first at line ${prior}) — ambiguous, neither guessed` })
      report.mapped = report.mapped.filter((m) => m.productKey !== productKey)
      continue
    }
    seen.set(productKey, line)
    report.mapped.push({ ...row, productKey })
  }
  return report
}
