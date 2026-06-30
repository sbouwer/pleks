/**
 * submitGate.test.ts — the all-green peer-submit gate (ADDENDUM_14R §4). Locks the key invariant: the LEAD is a
 * peer, so the application can't be submitted until the lead AND every co has finished their own section.
 */
import { describe, it, expect } from "vitest"
import { incompleteApplicantCount } from "./submitGate"

describe("incompleteApplicantCount — all-green peer-submit gate", () => {
  it("0 when the lead and every co are complete (submission allowed)", () => {
    expect(incompleteApplicantCount(true, [true, true])).toBe(0)
    expect(incompleteApplicantCount(true, [])).toBe(0) // a solo lead
  })

  it("counts the LEAD as a peer — an incomplete lead blocks submission (full peers)", () => {
    expect(incompleteApplicantCount(false, [true, true])).toBe(1)
    expect(incompleteApplicantCount(false, [])).toBe(1)
  })

  it("counts every incomplete co (and the lead)", () => {
    expect(incompleteApplicantCount(true, [true, false, false])).toBe(2)
    expect(incompleteApplicantCount(false, [false, true])).toBe(2)
  })
})
