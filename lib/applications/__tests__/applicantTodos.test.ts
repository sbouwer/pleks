/**
 * lib/applications/__tests__/applicantTodos.test.ts — the applicant's slice of a 14M evaluation (A18).
 */
import { describe, it, expect } from "vitest"
import { applicantTodos, isIntegrityCase } from "../applicantTodos"
import type { RulingFlag } from "../ruling"

const flag = (over: Partial<RulingFlag>): RulingFlag => ({
  id: 3, key: "stale_documents", axis: "confidence", severity: "major", type: "fixable",
  title: "Your most recent document is over a month old", remediation: "Upload a current-month bank statement or payslip.", ...over,
})

describe("applicantTodos", () => {
  it("turns fixable flags into to-dos", () => {
    expect(applicantTodos([flag({})], [])).toEqual([
      { key: "stale_documents", title: "Your most recent document is over a month old", action: "Upload a current-month bank statement or payslip." },
    ])
  })

  it("never surfaces a signal, override or structural flag (coach the evidence, not the number)", () => {
    const flags = [
      flag({ id: 8, key: "net_vs_credit_gap", axis: "risk", type: "signal", remediation: null }),
      flag({ id: 0, key: "residual_override", axis: "affordability", severity: "positive", type: "override", remediation: null }),
      flag({ id: 1, key: "affordability", axis: "affordability", severity: "block", type: "structural", remediation: "Add an earning co-applicant." }),
    ]
    expect(applicantTodos(flags, [])).toEqual([])
  })

  it("dedupes identical remediation prompts", () => {
    const a = flag({ key: "uncorroborated:salary", remediation: "Upload 3 months of statements." })
    const b = flag({ key: "uncorroborated:bonus", remediation: "Upload 3 months of statements." })
    expect(applicantTodos([a, b], [])).toHaveLength(1)
  })

  it("returns NO to-dos for an integrity case — a major integrity flag", () => {
    const flags = [flag({}), flag({ id: 7, key: "identity_mismatch", axis: "integrity", severity: "major" })]
    expect(applicantTodos(flags, [])).toEqual([])
  })

  it("returns NO to-dos when a warning or critical fraud signal is present", () => {
    expect(applicantTodos([flag({})], [{ severity: "warning" }])).toEqual([])
    expect(applicantTodos([flag({})], [{ severity: "critical" }])).toEqual([])
  })

  it("a data-hygiene warning (ID number in a filename) does not silence the to-dos; a critical one always does", () => {
    expect(applicantTodos([flag({})], [{ type: "embedded-id-in-filename", severity: "warning" }])).toHaveLength(1)
    expect(applicantTodos([flag({})], [{ type: "embedded-id-in-filename", severity: "critical" }])).toEqual([])
    expect(applicantTodos([flag({})], [{ type: "editor-software-source", severity: "warning" }])).toEqual([])
  })

  it("keeps to-dos for an info-level fraud signal and a minor integrity variation", () => {
    const soft = flag({ id: 7, key: "identity_soft_variation", axis: "integrity", severity: "minor", remediation: "Check the spelling matches." })
    expect(applicantTodos([flag({}), soft], [{ severity: "info" }])).toHaveLength(2)
  })

  it("tolerates a null flags / fraud column", () => {
    expect(applicantTodos(null, null)).toEqual([])
    expect(isIntegrityCase([], [null])).toBe(false)
  })
})
