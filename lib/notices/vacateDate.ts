/**
 * lib/notices/vacateDate.ts — Demand-to-Vacate service-date arithmetic (LEG-NOTICES-01 R-2)
 *
 * Notes:  R-2 = buffer, not precision. The printed {vacateByDate} must be baked into body_full BEFORE the
 *         SMTP-accept (deemed service IS the accept), so at dispatch we can only compute against the
 *         dispatch moment. We absorb the sub-second gap with a generous default: dispatch + 14 CALENDAR
 *         days, comfortably above the 7-day floor. The actual deemed-service anchor arrives later on the
 *         delivered notice_service_events row; deemedServiceMeetsFloor() then post-validates the ≥7-day
 *         floor so a delayed delivery that would breach it can be flagged for re-issue. Pure + injectable
 *         dates → deterministic tests (no new Date() inside).
 */

import { addCalendarDays, saDateISO } from "@/lib/dates"

/** R-2 default: the vacate deadline printed in the notice = base date + 14 calendar days (YYYY-MM-DD). */
export function computeVacateByDate(dispatchDate: Date, days = 14): string {
  return addCalendarDays(saDateISO(dispatchDate), days)
}

/**
 * R-2 post-validation: does (vacateByDate − deemed service date) meet the calendar-day floor?
 * false → the notice's vacate period is too short; flag for re-issue.
 *
 * Both operands are SAST CALENDAR DATES carried at UTC midnight, so the subtraction is whole-day
 * arithmetic. `deemedServiceAt` is a real INSTANT (the provider's delivered-at timestamp), so it must be
 * resolved to its SAST date via saDateISO — slicing its toISOString() would resolve it in UTC, and SAST
 * is UTC+2: a delivery between 22:00 and 24:00 UTC belongs to the NEXT SAST day. Getting that wrong
 * recorded deemed service a day EARLY, which makes (vac − deemedDay) LARGER and so PASSES a notice whose
 * vacate period is actually short of the floor — a fail-open on the exact check that exists to catch it.
 *
 * ⚠ computeVacateByDate above is calendar ARITHMETIC (addCalendarDays); this is a timezone RESOLUTION
 * (saDateISO). Both once read `.toISOString().slice(0,10)`, three lines apart — one correct, one a
 * fail-open. Same syntax, opposite meaning. Classify per site, never sweep.
 */
export function deemedServiceMeetsFloor(vacateByDate: string, deemedServiceAt: Date, floorDays = 7): boolean {
  const vac = new Date(`${vacateByDate}T00:00:00.000Z`).getTime()
  const deemedDay = new Date(`${saDateISO(deemedServiceAt)}T00:00:00.000Z`).getTime()
  const diffDays = Math.round((vac - deemedDay) / 86_400_000)
  return diffDays >= floorDays
}
