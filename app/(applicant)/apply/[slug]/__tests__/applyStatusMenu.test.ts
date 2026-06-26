/**
 * applyStatusMenu.test.ts — the hub's all-green gate + outstanding-owner naming (ADDENDUM_14Q increment 1).
 *
 * The gate is what lets/blocks Review & Submit, and the naming is the legibility CD §8.5 requires (a filler must see
 * WHO they're blocked on, and that a status-only party completes via their own link — not something the filler can fix).
 */
import { describe, it, expect } from "vitest"
import { summariseStatus, type StatusMenuPerson, type StatusMenuCompany } from "../applyStatusMenu"

const person = (over: Partial<StatusMenuPerson> = {}): StatusMenuPerson => ({ id: "self", name: "You", roleLabel: "Director", status: "completed", canOpen: true, ...over })
const company = (over: Partial<StatusMenuCompany> = {}): StatusMenuCompany => ({ name: "Acme (Pty) Ltd", status: "completed", canOpen: true, ...over })

describe("summariseStatus", () => {
  it("all cards completed → allGreen, nothing outstanding", () => {
    const r = summariseStatus(company(), [person(), person({ id: "co_1", name: "Di" })])
    expect(r.allGreen).toBe(true)
    expect(r.outstanding).toEqual([])
  })

  it("an outstanding person blocks the gate and is named", () => {
    const r = summariseStatus(null, [person(), person({ id: "co_1", name: "Di Rector", status: "in_progress" })])
    expect(r.allGreen).toBe(false)
    expect(r.outstanding).toEqual([{ name: "Di Rector", viaOwnLink: false }])
  })

  it("a status-only (cannot-open) outstanding party is flagged viaOwnLink — the filler can't fix it", () => {
    const r = summariseStatus(null, [person(), person({ id: "co_2", name: "Sue", status: "not_started", canOpen: false })])
    expect(r.outstanding).toEqual([{ name: "Sue", viaOwnLink: true }])
  })

  it("an incomplete company card blocks the gate too", () => {
    const r = summariseStatus(company({ status: "in_progress" }), [person()])
    expect(r.allGreen).toBe(false)
    expect(r.outstanding[0]).toMatchObject({ name: "Acme (Pty) Ltd", viaOwnLink: false })
  })

  it("no company (couple/guarantor) → gate rests on the people only", () => {
    expect(summariseStatus(null, [person(), person({ id: "co_1" })]).allGreen).toBe(true)
    expect(summariseStatus(undefined, [person({ status: "not_started" })]).allGreen).toBe(false)
  })
})
