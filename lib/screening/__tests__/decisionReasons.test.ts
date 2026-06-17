import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  DECLINE_REASON_CODES,
  ADVERSE_FACTOR_CODES,
  NOT_SHORTLISTED_REASON_CODES,
  WITHDRAWN_REASON_CODES,
  DECLINE_AGENT_DISCRETION_CODE,
  DECLINE_CRIMINAL_RECORD_CODE,
} from "../decisionReasons"
import { buildDecisionReasonConstraintsSql } from "../decisionReasonsSql"

describe("decision-reason canonical enums (SPEC_DECISION_REASON_ENUMS)", () => {
  const arrays = {
    decline: DECLINE_REASON_CODES,
    adverse: ADVERSE_FACTOR_CODES,
    not_shortlisted: NOT_SHORTLISTED_REASON_CODES,
    withdrawn: WITHDRAWN_REASON_CODES,
  } as const

  it("has no duplicate codes within any enum", () => {
    for (const [name, codes] of Object.entries(arrays)) {
      expect(new Set(codes).size, `${name} has duplicates`).toBe(codes.length)
    }
  })

  it("every code carries its enum prefix", () => {
    const prefix: Record<string, string> = {
      decline: "decline_", adverse: "adverse_",
      not_shortlisted: "not_shortlisted_", withdrawn: "withdrawn_",
    }
    for (const [name, codes] of Object.entries(arrays)) {
      for (const c of codes) expect(c.startsWith(prefix[name]), `${c} missing ${prefix[name]} prefix`).toBe(true)
    }
  })

  it("the flagged special codes are members of DECLINE_REASON_CODES", () => {
    expect(DECLINE_REASON_CODES).toContain(DECLINE_AGENT_DISCRETION_CODE)
    expect(DECLINE_REASON_CODES).toContain(DECLINE_CRIMINAL_RECORD_CODE)
  })

  // The CI drift guard (SPEC §7 approach A): the committed generated SQL must match the canonical TS.
  // If this fails, run: npx tsx scripts/codegen/decision-reason-enums.mts
  it("generated SQL matches the canonical TS (no TS↔SQL drift)", () => {
    const committed = readFileSync(
      join(process.cwd(), "scripts/codegen/decision_reason_constraints.generated.sql"),
      "utf8",
    )
    expect(committed).toBe(buildDecisionReasonConstraintsSql())
  })

  it("generated SQL references every code (constraint coverage)", () => {
    const sql = buildDecisionReasonConstraintsSql()
    for (const codes of Object.values(arrays)) {
      for (const c of codes) expect(sql.includes(`'${c}'`), `${c} missing from generated SQL`).toBe(true)
    }
  })
})
