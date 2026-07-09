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

/**
 * The current calendar date in South African Standard Time (UTC+2, no DST) as YYYY-MM-DD. Legal dates on a
 * notice MUST be SAST, not UTC (CD walk): between 00:00–02:00 SAST the UTC calendar date is still yesterday,
 * so a cancellation effective date computed off `toISOString()` would print a date that pre-dates its own
 * generation and service — a free argument for a tenant's attorney. Agents issue at odd hours; this fires
 * on late-night issuance before a morning deadline. `at` is injectable for deterministic tests.
 */
export function saTodayISO(at: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg", year: "numeric", month: "2-digit", day: "2-digit" }).format(at)
}

/** R-2 default: the vacate deadline printed in the notice = base date + 14 calendar days (YYYY-MM-DD). */
export function computeVacateByDate(dispatchDate: Date, days = 14): string {
  const d = new Date(dispatchDate.getTime())
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** R-2 post-validation: does (vacateByDate − deemed service date) meet the calendar-day floor?
 *  Compares whole calendar days in UTC. false → the notice's vacate period is too short; flag for re-issue. */
export function deemedServiceMeetsFloor(vacateByDate: string, deemedServiceAt: Date, floorDays = 7): boolean {
  const vac = new Date(`${vacateByDate}T00:00:00.000Z`).getTime()
  const deemedDay = new Date(`${deemedServiceAt.toISOString().slice(0, 10)}T00:00:00.000Z`).getTime()
  const diffDays = Math.round((vac - deemedDay) / 86_400_000)
  return diffDays >= floorDays
}
