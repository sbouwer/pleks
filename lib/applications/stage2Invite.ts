/**
 * lib/applications/stage2Invite.ts — may an application be invited to stage 2 (the paid credit check)?
 *
 * Notes:  ONE answer for the detail page's "Invite to Credit Check" button and the sendShortlistInvitation action
 *         (CD ruling 2026-10-02, #327). Stage 1 is either finished (`pre_screen_complete`) or already ticked from
 *         the triage list (`shortlisted` — shortlistStage1Action marks it and deliberately sends nothing), and no
 *         stage-2 status exists yet. The button used to require `pre_screen_complete` alone, so an applicant ticked
 *         in triage could never be invited.
 */
const INVITABLE_STAGE1 = new Set(["pre_screen_complete", "shortlisted"])

export function canInviteToStage2(stage1Status: string | null | undefined, stage2Status: string | null | undefined): boolean {
  return !!stage1Status && INVITABLE_STAGE1.has(stage1Status) && !stage2Status
}
