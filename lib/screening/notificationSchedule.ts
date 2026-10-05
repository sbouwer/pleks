/**
 * lib/screening/notificationSchedule.ts — the 14X milestone clock: when each party's reminders fall due, and its deadline
 *
 * Data:   none — pure functions of a party's T0 (its stage-2 invite) and the one window constant.
 * Notes:  ADDENDUM_14X §2. T0 = the party's own stage2_invited_at; D = T0 + SCREENING_WINDOW_DAYS. N1 is the invite
 *         itself (sent at shortlist). The clock-driven reminders are N2 at T0 + a and N4 at T0 + b, with a and b DERIVED
 *         from the window (CD lean: a = D/4, b = D/2, floored to whole days) so the schedule moves with the window rather
 *         than leaving a 3/7/10 stuck inside a different one. A 14-day window gives day 3 and day 7, the same days the
 *         t3/t7 reminders went out on before.
 *         CATCH-UP (§5 "a skipped cron day → the next run sends the missed milestone, never two"): only the LATEST due
 *         milestone is ever sent, and once it has a successful send, an earlier one is never sent after it.
 */
import { SCREENING_WINDOW_DAYS } from "@/lib/constants"
import { saDateISO } from "@/lib/dates"

const DAY_MS = 86_400_000

export type ReminderMilestone = "N2" | "N4"

/** Whole days after T0 at which each reminder falls due. */
export const REMINDER_OFFSET_DAYS: Readonly<Record<ReminderMilestone, number>> = {
  N2: Math.floor(SCREENING_WINDOW_DAYS / 4),
  N4: Math.floor(SCREENING_WINDOW_DAYS / 2),
}

/** Latest first: the order the catch-up rule reads them in. */
const LATEST_FIRST: readonly ReminderMilestone[] = ["N4", "N2"]

/** The instant the party's window closes. */
export function deadlineAt(t0: string): Date {
  return new Date(new Date(t0).getTime() + SCREENING_WINDOW_DAYS * DAY_MS)
}

/** D as the party is told it: the SA calendar date of the deadline (§4 "one date, stated the same way everywhere"). */
export function deadlineAsStated(t0: string): string {
  return saDateISO(deadlineAt(t0))
}

export function isPastDeadline(t0: string, now: Date = new Date()): boolean {
  return now.getTime() >= deadlineAt(t0).getTime()
}

/** The earliest T0 whose window is still open at `now`: a party invited before this instant has reached D. */
export function windowOpenSince(now: Date = new Date()): Date {
  return new Date(now.getTime() - SCREENING_WINDOW_DAYS * DAY_MS)
}

/** Whole days left before D, rounded up — what a resent invite says is left, rather than the full window (walker F2). */
export function daysRemaining(t0: string, now: Date = new Date()): number {
  return Math.max(0, Math.ceil((deadlineAt(t0).getTime() - now.getTime()) / DAY_MS))
}

/**
 * The reminder to send now, or null. `sentOk` holds the milestones this party already has a SUCCESSFUL send for —
 * a failed attempt does not count, so it is retried on the next run (14X §3, walker F4).
 */
export function dueReminder(t0: string, sentOk: ReadonlySet<string>, now: Date = new Date()): ReminderMilestone | null {
  if (isPastDeadline(t0, now)) return null
  const elapsedDays = Math.floor((now.getTime() - new Date(t0).getTime()) / DAY_MS)
  for (const m of LATEST_FIRST) {
    if (elapsedDays >= REMINDER_OFFSET_DAYS[m]) return sentOk.has(m) ? null : m
  }
  return null
}
