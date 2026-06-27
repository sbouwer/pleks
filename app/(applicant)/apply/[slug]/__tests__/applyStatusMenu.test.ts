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
  it("the filler's own openable cards done → fillerReady (status-only co's don't block)", () => {
    const r = summariseStatus(company(), [person(), person({ id: "co_1", name: "Di", canOpen: false, status: "not_started" })])
    expect(r.fillerReady).toBe(true)               // company + self done; the co completes via their own link
    expect(r.mine).toEqual([])
    expect(r.others).toEqual(["Di"])               // surfaced for transparency, not a gate
  })

  it("the filler's own section unfinished blocks the gate and is named", () => {
    const r = summariseStatus(null, [person({ status: "in_progress", name: "You Self" })])
    expect(r.fillerReady).toBe(false)
    expect(r.mine).toEqual(["You Self"])
  })

  it("a status-only co-applicant NEVER blocks the filler (server gates the everyone-check)", () => {
    const r = summariseStatus(null, [person(), person({ id: "co_2", name: "Sue", status: "not_started", canOpen: false })])
    expect(r.fillerReady).toBe(true)
    expect(r.others).toEqual(["Sue"])
  })

  it("an incomplete company card (openable) blocks the gate", () => {
    const r = summariseStatus(company({ status: "in_progress" }), [person()])
    expect(r.fillerReady).toBe(false)
    expect(r.mine).toEqual(["Acme (Pty) Ltd"])
  })

  it("solo individual → ready iff their one card is done", () => {
    expect(summariseStatus(null, [person()]).fillerReady).toBe(true)
    expect(summariseStatus(undefined, [person({ status: "not_started" })]).fillerReady).toBe(false)
  })
})
