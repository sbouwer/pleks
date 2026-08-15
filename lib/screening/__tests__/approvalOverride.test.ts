/**
 * lib/screening/__tests__/approvalOverride.test.ts — the approve-side discretion signal
 *
 * Notes:  The decline side of agent discretion has been captured since BUILD_F3
 *         (decline_agent_discretion_documented + a mandatory ≥100-char justification). The APPROVE
 *         side had nothing, and it is the half the human-in-the-loop discrimination defence actually
 *         rests on: "we show every applicant regardless of score" is procedural, whereas agents
 *         demonstrably APPROVING low-band applicants is a number.
 *
 *         SA law does not permit collecting race for tenant screening, so a classic disparate-impact
 *         test is unavailable — the defence has to be composed from what can lawfully be held, and
 *         this boolean is the cheapest load-bearing part of it.
 */
import { describe, it, expect } from "vitest"
import { ADVERSE_RECOMMENDATION_BANDS, isApprovalAgainstRecommendation, DISCRETION_MIN_TEXT_LENGTH } from "@/lib/screening/recordDecision"

// The engine's full band vocabulary (lib/screening/fitScoreEngine.v1.ts). Restated so a NEW band added
// to the engine without a decision here shows up as an unclassified value rather than silently
// defaulting to "not an override".
const ALL_BANDS = [
  "verified_stability",
  "stable_profile",
  "cautious_review",
  "limited_confidence",
  "adverse_signals",
  "limited_data_profile",
  "blocked",
] as const

describe("approving against the FitScore recommendation", () => {
  it("flags the adverse bands", () => {
    for (const band of ["cautious_review", "limited_confidence", "adverse_signals", "blocked"]) {
      expect(isApprovalAgainstRecommendation(band), band).toBe(true)
    }
  })

  it("does not flag a positive recommendation", () => {
    expect(isApprovalAgainstRecommendation("verified_stability")).toBe(false)
    expect(isApprovalAgainstRecommendation("stable_profile")).toBe(false)
  })

  it("does NOT flag limited_data_profile — a thin file is an evidence gap, not an adverse finding", () => {
    // Deliberate: conflating "approved despite adverse signals" with "approved without much signal"
    // would blunt the exact metric the defence turns on. The nuance survives because
    // fitscore_band_at_decision stores the real band, so thin-file approvals stay separately analysable.
    expect(isApprovalAgainstRecommendation("limited_data_profile")).toBe(false)
  })

  it("records only what it can stand behind — never infers from a missing band", () => {
    expect(isApprovalAgainstRecommendation(null)).toBe(false)
    expect(isApprovalAgainstRecommendation(undefined)).toBe(false)
    expect(isApprovalAgainstRecommendation("")).toBe(false)
  })

  it("classifies every band the engine can emit", () => {
    // A band added to the engine but not considered here would silently fall through to false —
    // i.e. an override that never gets recorded. Force the decision to be explicit.
    const classified = new Set<string>([...ADVERSE_RECOMMENDATION_BANDS, "verified_stability", "stable_profile", "limited_data_profile"])
    const unclassified = ALL_BANDS.filter((b) => !classified.has(b))
    expect(unclassified, `unclassified bands: ${unclassified.join(", ")}`).toEqual([])
  })
})

describe("the approve path stays frictionless — do not 'tidy' this away", () => {
  // ⚠ HIGHEST-RISK RULE IN THE ANALYTICS-CAPTURE SPEC (§9.2). The decline side requires a ≥100-char
  // justification (DISCRETION_MIN_TEXT_LENGTH). The approve side deliberately requires NOTHING, and
  // that asymmetry reads like an oversight — someone will eventually "fix" it in good faith.
  //
  // Why it must not be fixed: friction on a DECLINE is defensive and wanted. Friction on an APPROVE
  // suppresses the exact behaviour the discrimination defence depends on being common and honest.
  // Make an agent write 100 characters to approve a High Risk applicant and the approve-below-band
  // rate falls — destroying the evidence the flag exists to produce, while looking like diligence.
  //
  // The defence limb is "agents demonstrably approve low-band applicants at a non-trivial rate".
  // A validator that discourages that is not a safeguard; it is the failure.
  it("exports no minimum-length or required-note rule for the approve side", async () => {
    const mod = await import("@/lib/screening/recordDecision")
    const approveSideValidators = Object.keys(mod).filter((k) =>
      /approve/i.test(k) && /(min|require|valid|length)/i.test(k),
    )
    expect(
      approveSideValidators,
      `approve-side validation appeared: ${approveSideValidators.join(", ")} — see the comment above before removing this test`,
    ).toEqual([])
  })

  it("keeps the decline-side minimum, which IS wanted", () => {
    // The asymmetry is only meaningful while the decline side still carries its rule.
    expect(DISCRETION_MIN_TEXT_LENGTH).toBeGreaterThan(0)
  })
})
