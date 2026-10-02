/**
 * lib/applications/__tests__/stage2Invite.test.ts — the one stage-2 invite gate (CD 2026-10-02, #327)
 *
 * Notes:  Both directions: the triage-ticked applicant (`shortlisted`) is invitable as well as a completed stage 1,
 *         and nothing with a stage-2 status or an unfinished stage 1 is.
 */
import { describe, it, expect } from "vitest"
import { canInviteToStage2 } from "@/lib/applications/stage2Invite"

describe("canInviteToStage2", () => {
  it("opens for a completed stage 1 and for a triage tick, while no stage 2 exists", () => {
    expect(canInviteToStage2("pre_screen_complete", null)).toBe(true)
    expect(canInviteToStage2("shortlisted", null)).toBe(true)
  })

  it("stays shut once stage 2 has a status, and for every unfinished or terminal stage 1", () => {
    expect(canInviteToStage2("shortlisted", "invited")).toBe(false)
    expect(canInviteToStage2("pre_screen_complete", "screening_complete")).toBe(false)
    for (const s of ["pending_documents", "not_shortlisted", "", null, undefined]) expect(canInviteToStage2(s, null)).toBe(false)
  })
})
