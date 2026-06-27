/**
 * maritalConsistency.test.ts — ADDENDUM_14M spouse-linking amendment: the allow-but-flag consistency signals.
 *
 * Doctrine: never block — surface flags 15 (status/regime mismatch), 16 (address divergence), 17 (undisclosed
 * spouse-as-applicant) for the agent + deep scan. Match key = ID number.
 */
import { describe, it, expect } from "vitest"
import { maritalConsistencyFlags, type MaritalParty } from "../maritalConsistency"

const primary = (over: Partial<MaritalParty> = {}): MaritalParty => ({ ref: "primary", name: "Alex", idNumber: "ID_A", maritalStatus: "married", matrimonialRegime: "in_community", spouseInfo: { isCoApplicant: true, idNumber: "ID_B" }, addressKey: "12 oak st", ...over })
const co = (over: Partial<MaritalParty> = {}): MaritalParty => ({ ref: "co_1", name: "Bo", idNumber: "ID_B", maritalStatus: "married", matrimonialRegime: "in_community", addressKey: "12 oak st", ...over })
const ids = (fs: ReturnType<typeof maritalConsistencyFlags>) => fs.map((f) => f.id).sort((a, b) => a - b)

describe("maritalConsistencyFlags", () => {
  it("linked spouses agree (same regime + address) → no flags", () => {
    expect(maritalConsistencyFlags(primary(), [co()])).toEqual([])
  })

  it("flag 15 — the linked spouse declared a different status/regime", () => {
    expect(ids(maritalConsistencyFlags(primary(), [co({ maritalStatus: "single", matrimonialRegime: null })]))).toContain(15)
    expect(ids(maritalConsistencyFlags(primary(), [co({ matrimonialRegime: "out_anc" })]))).toContain(15)
  })

  it("flag 15 is NOT raised while the spouse hasn't declared yet (no false mismatch)", () => {
    expect(maritalConsistencyFlags(primary(), [co({ maritalStatus: null, matrimonialRegime: null, addressKey: null })])).toEqual([])
  })

  it("flag 16 — spouses applying together with different home addresses", () => {
    expect(ids(maritalConsistencyFlags(primary(), [co({ addressKey: "99 elm rd" })]))).toEqual([16])
  })

  it("flag 17 — an 'external' spouse whose ID matches a co-applicant on the application", () => {
    const p = primary({ spouseInfo: { isCoApplicant: false, idNumber: "ID_B" } })
    expect(ids(maritalConsistencyFlags(p, [co({ maritalStatus: null })]))).toEqual([17])
  })

  it("external spouse matching nobody → no flag 17", () => {
    const p = primary({ spouseInfo: { isCoApplicant: false, idNumber: "ID_STRANGER" } })
    expect(maritalConsistencyFlags(p, [co({ maritalStatus: null })])).toEqual([])
  })

  it("not married → no flags", () => {
    expect(maritalConsistencyFlags(primary({ maritalStatus: "single", spouseInfo: null }), [co({ maritalStatus: "single" })])).toEqual([])
  })

  it("flags are always non-blocking signals (minor)", () => {
    const fs = maritalConsistencyFlags(primary(), [co({ maritalStatus: "single", addressKey: "99 elm rd" })])
    expect(fs.every((f) => f.type === "signal" && f.severity === "minor")).toBe(true)
  })
})
