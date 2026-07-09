import { describe, it, expect } from "vitest"
import type { ComponentSnapshot } from "../fitScoreEngine.v1"
import {
  validateDeclineDecision,
  extractDecisionRatios,
  isDiscretionDecline,
  DISCRETION_MIN_TEXT_LENGTH,
} from "../recordDecision"

const longText = "x".repeat(DISCRETION_MIN_TEXT_LENGTH)

describe("validateDeclineDecision", () => {
  it("accepts a valid non-discretion code with adverse factors", () => {
    expect(validateDeclineDecision({
      declineReasonCode: "decline_affordability_income_low",
      adverseFactorCodes: ["adverse_income_below_threshold", "adverse_dti_above_threshold"],
    })).toBeNull()
  })

  it("rejects an unknown decline code", () => {
    expect(validateDeclineDecision({ declineReasonCode: "decline_made_up" as never })?.field).toBe("declineReasonCode")
  })

  it("rejects an unknown adverse-factor code", () => {
    expect(validateDeclineDecision({
      declineReasonCode: "decline_credit_default",
      adverseFactorCodes: ["adverse_nonsense" as never],
    })?.field).toBe("adverseFactorCodes")
  })

  it("rejects the criminal-record decline code (out of Pleks scope)", () => {
    expect(validateDeclineDecision({ declineReasonCode: "decline_criminal_record_relevant" })?.field).toBe("declineReasonCode")
  })

  it("rejects a criminal adverse factor (out of Pleks scope)", () => {
    expect(validateDeclineDecision({
      declineReasonCode: "decline_credit_default",
      adverseFactorCodes: ["adverse_criminal_record_relevant"],
    })?.field).toBe("declineReasonCode")
  })

  it("requires non-empty text for an agent-discretion decline (control 1)", () => {
    expect(validateDeclineDecision({ declineReasonCode: "decline_agent_discretion_documented", declineReasonText: "   " })?.field)
      .toBe("declineReasonText")
  })

  it("requires ≥100 characters for an agent-discretion decline (control 2)", () => {
    expect(validateDeclineDecision({ declineReasonCode: "decline_agent_discretion_documented", declineReasonText: "too short" })?.field)
      .toBe("declineReasonText")
  })

  it("accepts an agent-discretion decline with a sufficient explanation", () => {
    expect(validateDeclineDecision({ declineReasonCode: "decline_agent_discretion_documented", declineReasonText: longText })).toBeNull()
  })

  it("does not require text for non-discretion codes", () => {
    expect(validateDeclineDecision({ declineReasonCode: "decline_documentation_incomplete" })).toBeNull()
  })
})

describe("isDiscretionDecline", () => {
  it("is true only for the agent-discretion code", () => {
    expect(isDiscretionDecline("decline_agent_discretion_documented")).toBe(true)
    expect(isDiscretionDecline("decline_credit_default")).toBe(false)
  })
})

function snapshot(rentToIncomeRatio: number, verifiedCents: number[], debtToIncomeRatio: number | null = null): ComponentSnapshot {
  return {
    engineVersion: "fitscore.v1.0.1",
    applicants: verifiedCents.map((c, i) => ({ id: `a${i}`, verifiedIncomeCents: c })) as ComponentSnapshot["applicants"],
    lease: { rentToIncomeRatio, debtToIncomeRatio } as ComponentSnapshot["lease"],
  }
}

describe("extractDecisionRatios", () => {
  it("reads rent-to-income + threshold; DTI is null when the snapshot carries no bureau instalment source", () => {
    const r = extractDecisionRatios(snapshot(0.452, [200000, 0]), 0.3)
    expect(r.rent_to_income_ratio_at_decision).toBe(0.452)
    expect(r.affordability_threshold_at_decision).toBe(0.3)
    expect(r.dti_ratio_at_decision).toBeNull()
    expect(r.income_verification_status_at_decision).toBe("partially_verified")  // 1 of 2 verified
  })

  it("reads the bureau-instalment DTI from the snapshot, null when unknown (O-18)", () => {
    expect(extractDecisionRatios(snapshot(0.3, [100000], 0.42), 0.3).dti_ratio_at_decision).toBe(0.42)
    expect(extractDecisionRatios(snapshot(0.3, [100000], null), 0.3).dti_ratio_at_decision).toBeNull()
  })

  it("marks income verified when every applicant has verified income, unverifiable when none", () => {
    expect(extractDecisionRatios(snapshot(0.3, [100000, 200000]), 0.3).income_verification_status_at_decision).toBe("verified")
    expect(extractDecisionRatios(snapshot(0.3, [0]), 0.3).income_verification_status_at_decision).toBe("unverifiable")
  })

  it("is null-safe when no snapshot exists (threshold still passes through)", () => {
    const r = extractDecisionRatios(null, 0.3)
    expect(r.rent_to_income_ratio_at_decision).toBeNull()
    expect(r.income_verification_status_at_decision).toBeNull()
    expect(r.affordability_threshold_at_decision).toBe(0.3)
  })

  it("rejects a non-finite ratio", () => {
    expect(extractDecisionRatios(snapshot(Infinity, [100000]), 0.3).rent_to_income_ratio_at_decision).toBeNull()
  })
})
