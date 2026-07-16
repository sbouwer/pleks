/**
 * test/import/assembleFuzz.test.ts — the assembler's joins, fuzzed (ADDENDUM_21C Phase 3, §6)
 *
 * Notes:  Seeds × join-corruptions through `assemble`, asserting NEVER-MIS-JOIN and report-honesty on every case.
 *         The `namespace_collision` and `unnormalised_key` corruptions are the shapes a naive bare-REFERENCE join
 *         mis-joins on, run at scale.
 *
 *         ⚠ NOT THEATRE — the detector is proven to FIRE, permanently, by the last describe block: it feeds
 *         `checkAssembleInvariants` a hand-broken book (a lease with the wrong tenant; an orphan with no hold) and
 *         asserts each arm returns its violation. So the "27 passed" above is real proof, not a detector that
 *         couldn't fail. (The live-fire probes CD ran — forcing the tenant edge, disabling the orphan pass — are
 *         run manually and deliberately NOT committed: you do not ship a broken assembler. This block is the
 *         committed equivalent — it breaks the INPUT to the detector, never the assembler.)
 */
import { describe, it, expect } from "vitest"
import { assemble } from "@/lib/import/assemble/assemble"
import { generateReportSet, corruptJoins, checkAssembleInvariants, ALL_JOIN_CORRUPTIONS } from "./assembleFuzz"

const SEEDS = 300

describe("ASSEMBLER FUZZ — joins under corruption never mis-join, never vanish", () => {
  it(`holds across ${SEEDS} seeds × ${ALL_JOIN_CORRUPTIONS.length} join-corruptions`, () => {
    const failures: string[] = []
    for (let seed = 1; seed <= SEEDS; seed++) {
      const base = generateReportSet(seed)
      for (const c of ALL_JOIN_CORRUPTIONS) {
        const set = corruptJoins(base, c, seed)
        const book = assemble(set.tables)
        const v = checkAssembleInvariants(set, book)
        if (v.length) failures.push(`seed ${seed} / ${c}: ${v.map((x) => `${x.kind} — ${x.detail}`).join("; ")}`)
      }
    }
    expect(failures, `\n${failures.slice(0, 12).join("\n")}\n(${failures.length} total)`).toEqual([])
  })

  it("the clean set resolves every lease to its OWN tenant (never-mis-join, positively)", () => {
    const set = generateReportSet(7)
    const book = assemble(set.tables)
    const leaseRows = book.rows.filter((r) => r.__entity_type === "")
    expect(leaseRows.length).toBeGreaterThan(0)
    for (const row of leaseRows) {
      expect(row.id_number).toBe(set.groundTruth.get(row.property_name!)!.tenantId)
    }
    expect(book.ledger.resolved + book.ledger.held).toBe(book.ledger.total)
  })
})

describe("the detector itself FIRES — proof this tier is not theatre (CD walk, PR #216)", () => {
  it("MIS-JOIN arm: a lease carrying the WRONG tenant id is caught", () => {
    // Break the INPUT to the detector (a correct book, then hand-swap one tenant id), never the assembler itself.
    const set = generateReportSet(7)
    const book = assemble(set.tables)
    const leaseRow = book.rows.find((r) => r.__entity_type === "")!
    leaseRow.id_number = "0000000000000" // the wrong person on this lease — the catastrophic D-3 error
    const v = checkAssembleInvariants(set, book)
    expect(v.some((x) => x.kind === "MIS-JOIN")).toBe(true)
  })

  it("SILENT-ORPHAN arm: a dropped orphan reference is caught (the ONLY guard — resolved+held=total is tautological)", () => {
    const set = corruptJoins(generateReportSet(7), "orphan_ref", 7)
    const book = assemble(set.tables)
    // Remove the orphan hold the assembler correctly produced → simulate a silent drop.
    book.ledger.holds = book.ledger.holds.filter((h) => h.subject !== "LEA999999")
    const v = checkAssembleInvariants(set, book)
    expect(v.some((x) => x.kind === "SILENT-ORPHAN")).toBe(true)
  })

  it("both arms stay SILENT on a correct book (no false positives)", () => {
    const set = generateReportSet(7)
    expect(checkAssembleInvariants(set, assemble(set.tables))).toEqual([])
  })
})
