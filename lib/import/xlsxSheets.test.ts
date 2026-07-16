/**
 * lib/import/xlsxSheets.test.ts — the multi-tab silent-drop is closed (ADDENDUM_21C §0.2)
 *
 * Notes:  Both xlsx readers used to take SheetNames[0] and drop tabs 2..N in silence. These assert the two halves
 *         of the fix: nonEmptySheetNames SEES every data tab (and ignores blank spacers), and parseGLXlsx now
 *         parses a property from EVERY tab instead of tab 1 alone.
 *
 *         ⚠ PROBE-FIRES: the parseGLXlsx case was verified FAILING against the pre-fix reader — a 3-tab workbook
 *         returned ONE block, not three. A test that cannot show the drop cannot prove it is closed.
 */
import { describe, it, expect } from "vitest"
import * as XLSX from "xlsx"
import { nonEmptySheetNames } from "./xlsxSheets"
import { parseGLXlsx } from "./parseGLReport"

/** A workbook from { tabName: rows-of-cells }. Cell columns are 0-indexed (A=0, B=1, …). */
function workbook(tabs: Record<string, unknown[][]>): ArrayBuffer {
  const wb = XLSX.utils.book_new()
  for (const [name, rows] of Object.entries(tabs)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name)
  }
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer
}

/** One TPN GL property block: the "Name(Owner)" header lives in column D (index 3). */
function glBlock(propertyOwner: string): unknown[][] {
  return [["", "", "", propertyOwner]]
}

describe("nonEmptySheetNames — how many tabs actually carry data", () => {
  it("counts every data tab and IGNORES blank spacer tabs", () => {
    const wb = XLSX.read(
      workbook({ Leases: [["REFERENCE"], ["LEA000001"]], Blank: [["", ""]], Tenants: [["ID"], ["TEN000001"]] }),
      { type: "array" },
    )
    expect(nonEmptySheetNames(wb, XLSX)).toEqual(["Leases", "Tenants"])
  })

  it("a single data tab is length 1 — the degenerate case the upload path still accepts", () => {
    const wb = XLSX.read(workbook({ OnlyTab: [["REFERENCE"], ["LEA000001"]] }), { type: "array" })
    expect(nonEmptySheetNames(wb, XLSX)).toHaveLength(1)
  })
})

describe("parseGLXlsx — one property PER TAB, none silently dropped", () => {
  it("parses a property from EVERY non-empty tab, not tab 1 alone", () => {
    // Three tabs, one property each — exactly the shape (rptGLByProperty puts property 2 on tab 2) the old
    // SheetNames[0] reader dropped to a single block. Probe: pre-fix → 1; post-fix → 3.
    const buf = workbook({
      "Twin Peaks": glBlock("Twin Peaks(Johan Bouwer)"),
      "6 Boegoe St": glBlock("6 Boegoe St(Rox Test)"),
      "Third Prop": glBlock("Third Prop(Someone Else)"),
    })
    const blocks = parseGLXlsx(buf)
    expect(blocks.map((b) => b.propertyName)).toEqual(["Twin Peaks", "6 Boegoe St", "Third Prop"])
  })

  it("still handles the single-tab degenerate case", () => {
    const blocks = parseGLXlsx(workbook({ Only: glBlock("Solo Property(Owner)") }))
    expect(blocks).toHaveLength(1)
    expect(blocks[0]?.propertyName).toBe("Solo Property")
  })
})
