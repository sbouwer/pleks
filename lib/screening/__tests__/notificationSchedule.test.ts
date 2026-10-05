/**
 * lib/screening/__tests__/notificationSchedule.test.ts — the 14X milestone clock: offsets, catch-up, deadline
 *
 * Notes:  ADDENDUM_14X §2/§5. The offsets are asserted as a function of SCREENING_WINDOW_DAYS, not as 3 and 7, so a
 *         changed window moves the schedule; the 14-day reading is asserted once as the KNOWN-GOOD twin (day 3 and day 7,
 *         the days t3/t7 went out on before). Catch-up sends only the latest due milestone, and never an earlier one
 *         after it; a failed attempt (absent from sentOk) is retried.
 */
import { describe, expect, it } from "vitest"
import { SCREENING_WINDOW_DAYS } from "@/lib/constants"
import { REMINDER_OFFSET_DAYS, deadlineAsStated, deadlineAt, dueReminder, isPastDeadline } from "../notificationSchedule"

const DAY_MS = 86_400_000
const T0 = "2026-10-01T08:00:00.000Z"
const at = (days: number, extraMs = 0) => new Date(new Date(T0).getTime() + days * DAY_MS + extraMs)

describe("offsets derive from the window", () => {
  it("N2 = ⌊W/4⌋, N4 = ⌊W/2⌋, both strictly inside the window and in order", () => {
    expect(REMINDER_OFFSET_DAYS.N2).toBe(Math.floor(SCREENING_WINDOW_DAYS / 4))
    expect(REMINDER_OFFSET_DAYS.N4).toBe(Math.floor(SCREENING_WINDOW_DAYS / 2))
    expect(REMINDER_OFFSET_DAYS.N2).toBeGreaterThan(0)
    expect(REMINDER_OFFSET_DAYS.N2).toBeLessThan(REMINDER_OFFSET_DAYS.N4)
    expect(REMINDER_OFFSET_DAYS.N4).toBeLessThan(SCREENING_WINDOW_DAYS)
  })

  it.runIf(SCREENING_WINDOW_DAYS === 14)("KNOWN-GOOD: a 14-day window reminds on day 3 and day 7", () => {
    expect(REMINDER_OFFSET_DAYS).toEqual({ N2: 3, N4: 7 })
  })
})

describe("dueReminder", () => {
  const none = new Set<string>()
  const { N2, N4 } = REMINDER_OFFSET_DAYS

  it("nothing is due before N2", () => {
    expect(dueReminder(T0, none, at(N2, -1))).toBeNull()
  })

  it("N2 falls due exactly at its offset", () => {
    expect(dueReminder(T0, none, at(N2))).toBe("N2")
  })

  it("N2 sent → nothing until N4", () => {
    expect(dueReminder(T0, new Set(["N2"]), at(N4, -1))).toBeNull()
    expect(dueReminder(T0, new Set(["N2"]), at(N4))).toBe("N4")
  })

  it("CATCH-UP: a missed N2 past N4 sends N4, never N2", () => {
    expect(dueReminder(T0, none, at(N4 + 1))).toBe("N4")
  })

  it("PLANTED: N4 sent and N2 never sent → N2 is NOT sent after it", () => {
    expect(dueReminder(T0, new Set(["N4"]), at(N4 + 1))).toBeNull()
  })

  it("a failed attempt is not in sentOk, so it is retried on the next run", () => {
    expect(dueReminder(T0, none, at(N2 + 1))).toBe("N2")
  })

  it("past the deadline nothing is due, whatever was sent", () => {
    expect(dueReminder(T0, none, at(SCREENING_WINDOW_DAYS))).toBeNull()
  })
})

describe("deadline", () => {
  it("D = T0 + the window; past at D, not a millisecond before", () => {
    expect(deadlineAt(T0).getTime()).toBe(at(SCREENING_WINDOW_DAYS).getTime())
    expect(isPastDeadline(T0, at(SCREENING_WINDOW_DAYS, -1))).toBe(false)
    expect(isPastDeadline(T0, at(SCREENING_WINDOW_DAYS))).toBe(true)
  })

  it.runIf(SCREENING_WINDOW_DAYS === 14)("is stated as the SA calendar date, not the UTC one", () => {
    // 08:00Z is 10:00 SAST: the SA date and the UTC date agree.
    expect(deadlineAsStated(T0)).toBe("2026-10-15")
    // PLANTED: 23:30Z is 01:30 SAST the NEXT day — a UTC slice would say the 15th.
    expect(deadlineAsStated("2026-10-01T23:30:00.000Z")).toBe("2026-10-16")
  })
})
