/**
 * lib/import/xlsxSheets.ts — how many tabs actually carry data
 *
 * Data:   an in-memory SheetJS workbook (no I/O)
 * Notes:  Both xlsx readers used to take `SheetNames[0]` and silently drop the rest (ADDENDUM_21C §0.2). A
 *         multi-tab workbook is a relational table SET — importing tab 1 alone discards tabs 2..N with no report
 *         entry, a report-honesty fail-open. This is the shared primitive both readers now use to SEE the other
 *         tabs: the upload path halts on >1 (the multi-table assembler is not built yet), and the GL parser loops
 *         over all of them. `import type` keeps SheetJS out of any caller's bundle that passes its own instance.
 */
import type * as XLSXType from "xlsx"

/**
 * Names of the sheets that contain at least one non-blank cell, in workbook order. Blank/spacer tabs (which a
 * real export commonly carries) are excluded so a workbook with one data tab + a blank tab is NOT treated as
 * multi-table. Caller passes its own SheetJS instance so this stays bundle-neutral.
 */
export function nonEmptySheetNames(workbook: XLSXType.WorkBook, xlsx: typeof XLSXType): string[] {
  return workbook.SheetNames.filter((name) => {
    const sheet = workbook.Sheets[name]
    if (!sheet) return false
    const rows = xlsx.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "" })
    return rows.some((row) => Array.isArray(row) && row.some((cell) => String(cell ?? "").trim() !== ""))
  })
}
