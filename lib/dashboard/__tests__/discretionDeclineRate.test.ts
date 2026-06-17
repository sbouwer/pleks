import { describe, it, expect } from "vitest"
import { computeDiscretionFlags, DISCRETION_MIN_DECLINES_TO_FLAG } from "../discretionDeclineRate"

const D = "decline_agent_discretion_documented"
const STD = "decline_affordability_income_low"

/** n rows for an agent: `discretion` of them discretionary, the rest standard. */
function rows(agent: string, total: number, discretion: number) {
  return Array.from({ length: total }, (_, i) => ({ decided_by: agent, decline_reason_code: i < discretion ? D : STD }))
}

describe("computeDiscretionFlags", () => {
  it("flags an agent over the 15% threshold once past the minimum-volume floor", () => {
    const flags = computeDiscretionFlags(rows("agent-a", 10, 3))   // 30%
    expect(flags).toHaveLength(1)
    expect(flags[0]).toMatchObject({ agentId: "agent-a", discretionCount: 3, totalDeclines: 10, ratePct: 30 })
  })

  it("does NOT flag below the threshold", () => {
    expect(computeDiscretionFlags(rows("agent-b", 20, 2))).toHaveLength(0)   // 10%
  })

  it("does NOT flag a tiny denominator even at 100% (avoids 1/1 noise)", () => {
    expect(computeDiscretionFlags(rows("agent-c", DISCRETION_MIN_DECLINES_TO_FLAG - 1, DISCRETION_MIN_DECLINES_TO_FLAG - 1))).toHaveLength(0)
  })

  it("ignores rows with no deciding agent or no decline code", () => {
    const noisy = [
      { decided_by: null, decline_reason_code: D },
      { decided_by: "agent-d", decline_reason_code: null },
      ...rows("agent-d", 8, 5),   // 62.5%
    ]
    const flags = computeDiscretionFlags(noisy)
    expect(flags).toHaveLength(1)
    expect(flags[0].totalDeclines).toBe(8)   // the null-code row not counted
  })

  it("sorts multiple flagged agents by rate descending", () => {
    const flags = computeDiscretionFlags([...rows("low", 10, 2), ...rows("high", 10, 8)])
    expect(flags.map((f) => f.agentId)).toEqual(["high", "low"])
  })
})
