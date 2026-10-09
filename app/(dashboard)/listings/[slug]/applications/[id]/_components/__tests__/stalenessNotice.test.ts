/**
 * .../applications/[id]/_components/__tests__/stalenessNotice.test.ts — the ruling card says when its documents moved on
 *
 * Notes:  A18 walker N2. At the cap a document change re-runs nothing, so the card is the only place the agent can learn
 *         the ruling no longer reads the applicant's documents. Planted: a change (and an unreadable answer) is shown,
 *         and at the cap the agent is told no pass will follow. Known-good: unchanged documents show nothing.
 */
import { describe, expect, it } from "vitest"
import { MAX_SCREENING_ITERATIONS } from "@/lib/constants"
import { stalenessNotice } from "../ScreeningRulingCard"

describe("stalenessNotice (A18 walker N2)", () => {
  it("KNOWN-GOOD: a ruling on the current documents carries no notice", () => {
    expect(stalenessNotice(false, 1)).toBeNull()
    expect(stalenessNotice(false, MAX_SCREENING_ITERATIONS)).toBeNull()
  })

  it("PLANTED: changed documents below the cap are marked, without claiming no pass will follow", () => {
    const n = stalenessNotice(true, MAX_SCREENING_ITERATIONS - 1)
    expect(n).toMatch(/may not reflect them/)
    expect(n).not.toMatch(/will not re-run/)
  })

  it("PLANTED: changed documents AT the cap tell the agent nothing will re-run", () => {
    expect(stalenessNotice(true, MAX_SCREENING_ITERATIONS)).toMatch(/will not re-run/)
  })

  it("an unreadable answer is said, never shown as current", () => {
    expect(stalenessNotice(null, 1)).toMatch(/Could not check/)
  })
})
