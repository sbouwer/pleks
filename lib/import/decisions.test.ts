/**
 * lib/import/decisions.test.ts — F-13: the wizard→runner contract
 *
 * The two halves shared no key but `columnMapping`, and `await req.json()` being `any` meant TypeScript never
 * saw it. Every assertion here is a decision the agent made in the UI that used to be silently discarded.
 */
import { describe, it, expect } from "vitest"
import { toImportDecisions, toColumnMapping } from "./decisions"

describe("toImportDecisions — the decisions the wizard has always discarded", () => {
  it("translates \"skip expired leases\" — the wizard DEFAULT, printed on the confirm screen", () => {
    // `decisions.expiredLeases` was ALWAYS undefined in production, so this branch was dead and every expired
    // lease imported anyway, under a confirmation screen that said the opposite.
    expect(toImportDecisions({ expiredLeaseAction: "skip" }).expiredLeases).toBe("import_active_only")
  })

  it("translates \"import as expired\"", () => {
    expect(toImportDecisions({ expiredLeaseAction: "import_as_expired" }).expiredLeases).toBe("import_all")
  })

  it("falls back to the SAFE option — never to \"import everything\"", () => {
    // This is client-supplied JSON. Failing the other way resurrects dead leases from a migrated book as live.
    for (const wire of [undefined, null, {}, { expiredLeaseAction: "nonsense" as never }]) {
      expect(toImportDecisions(wire).expiredLeases, JSON.stringify(wire)).toBe("import_active_only")
    }
  })

  it("splits the per-row overrides into the runner's two concepts", () => {
    const d = toImportDecisions({
      expiredLeaseAction: "skip",
      perRowOverrides: { 0: "active", 3: "skip", 7: "active" },
    })
    expect(d.forceActiveRows.sort((a, b) => a - b)).toEqual([0, 7])   // "Keep active" checkboxes
    expect(d.skipRows).toEqual([3])
  })

  it("ignores malformed override keys rather than throwing on a hostile body", () => {
    const d = toImportDecisions({
      perRowOverrides: { "-1": "skip", abc: "active", 2: "active" } as never,
    })
    expect(d.forceActiveRows).toEqual([2])
    expect(d.skipRows).toEqual([])
  })

  it("conflicts are empty because no wizard step collects them — not because they were lost", () => {
    expect(toImportDecisions({ expiredLeaseAction: "skip" }).conflicts).toEqual([])
  })
})

describe("toColumnMapping — fills the `column` the wizard never sends", () => {
  it("makes the wire shape honest against the runner's MappedField", () => {
    expect(toColumnMapping({ "Monthly Rent": { field: "rent_amount_cents", entity: "lease" } })).toEqual({
      "Monthly Rent": { column: "Monthly Rent", field: "rent_amount_cents", entity: "lease" },
    })
  })

  it("drops entries with no field (an unmapped/skipped column)", () => {
    expect(toColumnMapping({ Junk: { field: "", entity: "" } })).toEqual({})
    expect(toColumnMapping(undefined)).toEqual({})
  })
})
