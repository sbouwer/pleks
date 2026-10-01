/**
 * lib/searchworx/rates/priceListFile.ts — turns an uploaded price-list workbook (.xls / .xlsx) into the text parsePriceList reads
 *
 * Data:   an in-memory file buffer (no I/O); the caller passes its own SheetJS instance, so SheetJS stays out of any
 *         bundle that does not already load it (the xlsxSheets.ts pattern)
 * Notes:  Searchworx delivers the price list as an .xls; the CSV was only ever a conversion of its first tab.
 *         Converting in one place keeps ONE parser (priceList.ts) for both forms, so a workbook cannot be read by
 *         looser rules. The vendor export (read 2026-10-01, "Default Pricelist - 01 Oct.xls") has TWO tabs: the list
 *         (`Search Type | Price`) and a metadata tab (`PricingCategory | EffectiveDate`, e.g. STANDARD,
 *         "20/04/2026 15:13:21"). Each data tab is classified by its header row; exactly one list tab is required,
 *         at most one metadata tab is read and RETURNED (the admin sees the vendor's own effective date), and any
 *         other tab with data refuses the whole workbook — never silently dropped (ADDENDUM_21C §0.2).
 *         `rawNumbers` emits a numeric cell's value, not its display format ("R 17.70" would be rejected); `strip`
 *         drops trailing empty cells, which would otherwise put a comma after the price.
 */
import type * as XLSXType from "xlsx"
import { nonEmptySheetNames } from "@/lib/import/xlsxSheets"
import { isSaDateISO } from "@/lib/dates"

export interface VendorListMeta {
  category: string | null
  /** The vendor's EffectiveDate as YYYY-MM-DD, or null when absent or unreadable. */
  effectiveDate: string | null
  /** The cell as the vendor wrote it, for display when it could not be read. */
  effectiveDateText: string | null
}

export type SheetText = { ok: true; text: string; meta: VendorListMeta | null } | { ok: false; error: string }

const LIST_HEADER = /^search type\s*,\s*price\s*$/im
const META_HEADER = /^pricingcategory\s*,\s*effectivedate\s*$/im
const VENDOR_DATE = /^(\d{2})\/(\d{2})\/(\d{4})(?:\s|$)/

function readMeta(csv: string): VendorListMeta {
  const lines = csv.split(/\r?\n/)
  const at = lines.findIndex((l) => META_HEADER.test(l.trim()))
  const row = (lines[at + 1] ?? "").split(",")
  const category = row[0]?.trim() || null
  const effectiveDateText = row[1]?.trim() || null
  const m = VENDOR_DATE.exec(effectiveDateText ?? "")
  const iso = m ? `${m[3]}-${m[2]}-${m[1]}` : null
  return { category, effectiveDate: iso && isSaDateISO(iso) ? iso : null, effectiveDateText }
}

export function priceListSheetText(data: ArrayBuffer | Uint8Array, xlsx: typeof XLSXType): SheetText {
  const workbook = xlsx.read(data, { type: "array" })
  const tabs = nonEmptySheetNames(workbook, xlsx).map((name) => ({
    name,
    csv: xlsx.utils.sheet_to_csv(workbook.Sheets[name], { rawNumbers: true, strip: true, blankrows: false }),
  }))
  if (tabs.length === 0) return { ok: false, error: "the workbook has no data" }

  const lists = tabs.filter((t) => LIST_HEADER.test(t.csv))
  const metas = tabs.filter((t) => !LIST_HEADER.test(t.csv) && META_HEADER.test(t.csv))
  const other = tabs.filter((t) => !lists.includes(t) && !metas.includes(t))
  if (lists.length !== 1) {
    return { ok: false, error: `expected one tab headed "Search Type | Price", found ${lists.length}` }
  }
  if (metas.length > 1 || other.length > 0) {
    const names = [...metas.slice(1), ...other].map((t) => t.name).join(", ")
    return { ok: false, error: `the workbook has tab(s) this import does not know (${names}) — nothing was read` }
  }
  return { ok: true, text: lists[0].csv, meta: metas[0] ? readMeta(metas[0].csv) : null }
}
