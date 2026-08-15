/**
 * lib/legal/__tests__/purpose-integrity.test.ts — the operators↔purposes referential invariant
 *
 * Notes:  Nothing asserted this before 2026-08-14, which is how B26 (criminal-background screening)
 *         survived: the purpose was cancelled per ADDENDUM_14E on 2026-05-21, but the operators
 *         directory kept listing it in `purposes` arrays and advertising a contiguous "B1–B27" range,
 *         so /popia-register asserted a purpose it no longer defined. `check-marketing-consistency`
 *         covers count strings, charter anchors and canonical phrases — none of which sees a purpose
 *         deleted out from under an operator.
 *
 *         PROBE-FIRES: each test here was verified failing against the pre-fix data — re-adding "B26"
 *         to any OPERATORS[].purposes array, or restoring purposesDisplay to "A1–A12, B1–B27", turns
 *         the relevant test red.
 */
import { describe, it, expect } from "vitest"
import { POPIA_PURPOSES } from "@/lib/legal/popia-purposes"
import { OPERATORS } from "@/lib/legal/operators"

const DEFINED_IDS = new Set(POPIA_PURPOSES.map((p) => p.id))

/**
 * Expand a display string into the concrete purpose ids it claims.
 *
 * Real published strings are prose, not a grammar: "A3 only", "B9, B27, A8 (limited)",
 * "A1, A4, A7–A9, A12; B2, ...", "B27 (property valuation sub-purpose only)", "None for customer data".
 * So scan for id tokens and ranges rather than parsing delimiters — parenthetical qualifiers are
 * dropped first because they carry scope prose, never additional id claims.
 */
const RANGE_RE = /([AB])(\d+)\s*[–-]\s*([AB])(\d+)/g

function expandDisplay(display: string): string[] {
  // [^()]* not [^)]* — excluding BOTH parens keeps this linear (sonarjs/super-linear-regex).
  const cleaned = display.replace(/\([^()]*\)/gu, " ")
  const out: string[] = []

  for (const m of cleaned.matchAll(RANGE_RE)) {
    const [, prefixFrom, from, prefixTo, to] = m
    if (prefixFrom !== prefixTo) continue // mixed-prefix range is prose, not an id claim
    for (let n = Number(from); n <= Number(to); n++) out.push(`${prefixFrom}${n}`)
  }

  // Strip the ranges before hunting standalone ids, so "A7–A9" does not also yield a bare A7 and A9.
  for (const m of cleaned.replace(RANGE_RE, " ").matchAll(/\b([AB]\d+)\b/g)) out.push(m[1])

  return [...new Set(out)]
}

describe("POPIA purpose ids are internally consistent", () => {
  it("defines no duplicate purpose ids", () => {
    const ids = POPIA_PURPOSES.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("defines only A-prefixed or B-prefixed ids", () => {
    for (const p of POPIA_PURPOSES) expect(p.id).toMatch(/^[AB]\d+$/)
  })
})

describe("every operator references only purposes that exist", () => {
  it("resolves every id in every OPERATORS[].purposes array", () => {
    const dangling: string[] = []
    for (const op of OPERATORS) {
      for (const id of op.purposes) {
        if (!DEFINED_IDS.has(id)) dangling.push(`${op.name} → ${id}`)
      }
    }
    expect(dangling, `operators referencing undefined purposes: ${dangling.join(", ")}`).toEqual([])
  })

  it("resolves every id implied by the published purposesDisplay range", () => {
    const dangling: string[] = []
    for (const op of OPERATORS) {
      for (const id of expandDisplay(op.purposesDisplay)) {
        if (!DEFINED_IDS.has(id)) dangling.push(`${op.name} "${op.purposesDisplay}" → ${id}`)
      }
    }
    // A contiguous range that spans a deleted id is the exact defect this file exists to catch: the
    // directory would advertise a purpose the register does not define.
    expect(dangling, `purposesDisplay implying undefined purposes: ${dangling.join(", ")}`).toEqual([])
  })

  it("keeps purposesDisplay in agreement with the purposes array", () => {
    const mismatched: string[] = []
    for (const op of OPERATORS) {
      const displayed = new Set(expandDisplay(op.purposesDisplay))
      const declared = new Set(op.purposes)
      for (const id of declared) if (!displayed.has(id)) mismatched.push(`${op.name}: ${id} in purposes, absent from display`)
      for (const id of displayed) if (!declared.has(id)) mismatched.push(`${op.name}: ${id} in display, absent from purposes`)
    }
    expect(mismatched, mismatched.join(" · ")).toEqual([])
  })
})

describe("cancelled purposes stay cancelled", () => {
  it("does not define B26 (criminal-background screening — cancelled ADDENDUM_14E 2026-05-21)", () => {
    // Guard, not decoration: the capability is refused at lib/screening/recordDecision.ts and its policy
    // table is unwritable (RLS WITH CHECK false). Re-adding it to the public register without a live
    // implementation would re-import the POPIA s57(1)(b) prior-authorisation question this removal retired.
    expect(DEFINED_IDS.has("B26")).toBe(false)
  })

  it("names no cancelled sub-operator in the operators directory", () => {
    const names = OPERATORS.map((o) => o.name.toLowerCase())
    expect(names).not.toContain("huru")
  })
})
