/**
 * lib/screening/window.ts — a party's screening window, measured from its own stage-2 invite (14W §0b, ONE CLOCK)
 *
 * Notes:  Every party's window runs SCREENING_WINDOW_DAYS from its own stage2_invited_at. The reminders cron declines at
 *         this end; the pay surfaces close at it, so a form cannot be opened, and paid, after the deadline.
 */
import { SCREENING_WINDOW_DAYS } from "@/lib/constants"

const DAY_MS = 86_400_000

/** The instant a party's window closes, in ms since epoch. */
function windowEndMs(stage2InvitedAt: string): number {
  return Date.parse(stage2InvitedAt) + SCREENING_WINDOW_DAYS * DAY_MS
}

/** True while the party's window is still open. */
export function windowOpen(stage2InvitedAt: string, now = Date.now()): boolean {
  return now < windowEndMs(stage2InvitedAt)
}
