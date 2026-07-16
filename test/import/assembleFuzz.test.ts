/**
 * test/import/assembleFuzz.test.ts — the assembler's joins, fuzzed (ADDENDUM_21C Phase 3, §6)
 *
 * Notes:  Seeds × join-corruptions through `assemble`, asserting NEVER-MIS-JOIN and report-honesty on every case.
 *         The probe-fires demonstration (a bare-REFERENCE join mis-joins) lives in assemble.test.ts, where the
 *         namespace prefix can be surgically dropped; here the `namespace_collision` and `unnormalised_key`
 *         corruptions are the shapes that WOULD break such a join, run at scale.
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
