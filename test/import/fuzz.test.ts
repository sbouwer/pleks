/**
 * test/import/fuzz.test.ts — the fuzz tier that runs on EVERY gate
 *
 * Notes:  500 books on every `npm run check` — about a second, because the pure path costs ~2 ms a book. The
 *         deep run (`npm run fuzz`, 5 000+) is for hunting; this one is for not regressing.
 *
 *         ⚠ It proves the mapping, parsing, classification and plausibility layers, and NOTHING about NOT NULL,
 *         CHECK, triggers or unique indexes — those live at the write boundary and are the DB tier's job. A
 *         green fuzz is not a proven importer, and saying so in the header is cheaper than being misread later.
 */
import { describe, it, expect } from "vitest"
import { fuzz, formatReport } from "./fuzz"

describe("FUZZ — 500 generated books, no database", () => {
  it("no book is silently accepted with a value no human meant", () => {
    const report = fuzz({ cases: 500, leasesPerBook: 8 })

    expect(report.rowsChecked, "the fuzzer must actually have checked something").toBeGreaterThan(1000)

    if (report.findings.length > 0) console.log(formatReport(report))
    expect(
      report.findings.map((f) => `seed ${f.seed} · ${f.dialect} · row ${f.rowIndex}: ${f.detail}`),
      "every finding is replayable from its seed",
    ).toEqual([])
  }, 120_000)
})
