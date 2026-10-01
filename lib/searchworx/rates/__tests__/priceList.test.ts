/**
 * lib/searchworx/rates/__tests__/priceList.test.ts — the price-list importer against the real 2026-10-01 export (ADDENDUM_14V §5)
 *
 * Notes:  The fixture is the Default list as downloaded (`__fixtures__/pricelist_default_2026-10-01.csv`, copied
 *         from brief/vendors/searchworx/raw/ so CI can read it). §5: an unmapped vendor name is reported and the
 *         mapped rows still commit. Both directions probed: a reshuffled or truncated list commits nothing.
 */
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it, vi } from "vitest"
import { parsePriceList, priceToCents } from "@/lib/searchworx/rates/priceList"
import { importPriceList } from "@/lib/searchworx/rates/importPriceList"
import type { SupabaseClient } from "@supabase/supabase-js"

const CSV = readFileSync(join(__dirname, "../__fixtures__/pricelist_default_2026-10-01.csv"), "utf8")

function fakeDb() {
  const inserted: Record<string, unknown>[] = []
  const insert = vi.fn(async (rows: Record<string, unknown>[]) => { inserted.push(...rows); return { error: null } })
  return { db: { from: () => ({ insert }) } as unknown as SupabaseClient, inserted, insert }
}

describe("priceToCents — text, never float", () => {
  it.each([["17.70", 1770], ["17.7", 1770], ["17", 1700], ["194.10", 19410], ["0.29", 29]])("%s → %i", (t, c) => {
    expect(priceToCents(t)).toBe(c)
  })
  it.each(["", "R17.70", "17,70", "1.234", "-5.00", "abc"])("rejects %j", (t) => expect(priceToCents(t)).toBeNull())
})

describe("the 2026-10-01 Default list", () => {
  const report = parsePriceList(CSV)

  it("parses every row: nothing rejected", () => expect(report.rejected).toEqual([]))

  it("maps exactly the seven products Pleks uses, at the list's prices", () => {
    const got = Object.fromEntries(report.mapped.map((m) => [m.productKey, m.cents]))
    expect(got).toEqual({
      cipc_company: 1770,
      cipc_director: 1770,
      combined_consumer_credit_report: 19410,
      compuscan_company_profile: 12980,
      deeds_search: 2560,
      lightstone_erf_short: 13500,
      vccb_income_estimator: 715,
    })
  })

  it("reports every other row as unmapped rather than guessing (the deeds volume breaks among them)", () => {
    expect(report.mapped.length + report.unmapped.length).toBe(174)
    expect(report.unmapped.map((u) => u.name)).toContain("DEEDS OFFICE SEARCH * - VOLUME BREAK 1 (501 TO 1000)")
    expect(report.unmapped.map((u) => u.name)).toContain("COMPUSCAN COMPANY PROFILE DETAILED")
  })
})

describe("importPriceList", () => {
  it("records one pricelist_import observation per mapped row, referencing file and line, and commits despite unmapped names", async () => {
    const { db, inserted } = fakeDb()
    const r = await importPriceList(db, { csv: CSV, filename: "pricelist_default_2026-10-01.csv", vendorEffectiveDate: "2026-10-01" })
    expect(r).toMatchObject({ ok: true, recorded: 7 })
    expect(inserted).toHaveLength(7)
    expect(inserted.find((o) => o.product_key === "vccb_income_estimator")).toMatchObject({
      source: "pricelist_import",
      cost_excl_vat_cents: 715,
      source_ref: "pricelist_default_2026-10-01.csv:160",
      raw: { vendor_name: "VCCB INCOME ESTIMATOR", line: 160, vendor_effective_date: "2026-10-01" },
    })
  })

  it("PLANTED: a reshuffled export (price column moved) commits NOTHING", async () => {
    const { db, insert } = fakeDb()
    const shuffled = CSV.replace("CIPC COMPANY,17.70", "17.70,CIPC COMPANY")
    expect(await importPriceList(db, { csv: shuffled, filename: "x", vendorEffectiveDate: "2026-10-01" })).toMatchObject({ ok: false, reason: "rejected_lines" })
    expect(insert).not.toHaveBeenCalled()
  })

  it("PLANTED: a file with no header is not a price list", async () => {
    const { db, insert } = fakeDb()
    const r = await importPriceList(db, { csv: CSV.replace("Search Type,Price", "Product,Amount"), filename: "x", vendorEffectiveDate: "2026-10-01" })
    expect(r).toMatchObject({ ok: false, reason: "rejected_lines" })
    expect(insert).not.toHaveBeenCalled()
  })

  it("PLANTED: two prices for one product are ambiguous — rejected, neither guessed", () => {
    const r = parsePriceList(`Search Type,Price\nCIPC COMPANY,17.70\nCIPC COMPANY,19.00\n`)
    expect(r.mapped).toEqual([])
    expect(r.rejected[0].reason).toMatch(/second price for cipc_company/)
  })

  it("a list mapping nothing commits nothing", async () => {
    const { db, insert } = fakeDb()
    expect(await importPriceList(db, { csv: "Search Type,Price\nSOMETHING ELSE,1.00\n", filename: "x", vendorEffectiveDate: "2026-10-01" }))
      .toMatchObject({ ok: false, reason: "nothing_mapped" })
    expect(insert).not.toHaveBeenCalled()
  })
})
