/**
 * lib/dates/saHolidayStatute.ts — the STATUTE itself: Schedule 1, the computus, and s2(1)'s mechanics
 *
 * ⚠ THIS MODULE KNOWS THE LAW; IT DOES NOT KNOW THE TABLE. It imports no JSON, validates nothing and
 *   serves nothing — so both the CARETAKER (`./saPublicHolidays.ts`, which validates the committed
 *   artefact) and the GENERATOR (`./saHolidayDerivation.ts`, which produces it) can sit on top of it.
 *
 *   That separation is load-bearing, not tidiness. The caretaker validates `saHolidays.json` at MODULE
 *   LOAD and throws at boot. Were the generator to reach these primitives THROUGH the caretaker, a
 *   malformed committed table would make the generator unloadable — the one tool that could produce a
 *   correct one. **A generator that cannot run when its output is broken is not authoritative**
 *   (ADDENDUM_70L A3), so the shared law lives here, below both.
 *
 *   Nothing in this file decides what the table CONTAINS. Computing a holiday and proclaiming one are
 *   different acts (D-7d): s2A proclamations are human entries with a Gazette reference and can never be
 *   derived from anything here.
 *
 * Notes:  All arithmetic is UTC-anchored on YYYY-MM-DD strings. Never getDay()/setDate() here — those are
 *         LOCAL-time accessors, so they mean UTC on Vercel and SAST on a dev machine.
 *
 *         Moved out of saPublicHolidays.ts by ADDENDUM_70L Phase A, unchanged in behaviour. The caretaker
 *         re-exports what its own consumers already imported, so no caller moved with them.
 */

/** Statutory citation for a Schedule-1 holiday — the Act's own twelve. */
export const BASIS_SCHEDULE_1 = "PHA s1 Sch 1"

/** Statutory citation for an observed Monday created by the Sunday rule. */
export const BASIS_SHIFT = "PHA s2(1)"

/**
 * Statutory citation for a presidential proclamation.
 *
 * Exported because the AUDITOR needs it too: `holidayAudit.ts` treats a proclaimed date missing from a
 * witness feed as informational rather than an alert, and that rule must key off the same string the
 * caretaker validates against (Rule 5), never a restated copy of it.
 */
export const BASIS_PROCLAMATION = "PHA s2A"

export const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

/**
 * Schedule 1's TEN fixed-date holidays, as MM-DD → name. (The other two — Good Friday and Family Day —
 * move with Easter and are derived below.) This set is what makes the D-7f carve-out checkable in BOTH
 * directions: the caretaker must know that 26 December is a public holiday in its own right, or it cannot
 * tell a legitimate s2(1) shift from a fabricated one landing on Day of Goodwill.
 *
 * The NAMES are part of the statute's expression, not decoration — the generator emits them verbatim and
 * the committed table is diffed against that, so a rename here is a deliberate change to the artefact.
 */
export const SCHEDULE_1_FIXED: ReadonlyMap<string, string> = new Map([
  ["01-01", "New Year's Day"],
  ["03-21", "Human Rights Day"],
  ["04-27", "Freedom Day"],
  ["05-01", "Workers' Day"],
  ["06-16", "Youth Day"],
  ["08-09", "National Women's Day"],
  ["09-24", "Heritage Day"],
  ["12-16", "Day of Reconciliation"],
  ["12-25", "Christmas Day"],
  ["12-26", "Day of Goodwill"],
])

export const isScheduleOneFixed = (iso: string): boolean => SCHEDULE_1_FIXED.has(iso.slice(5))

/** The two Easter-derived Schedule-1 holidays, as offsets from Easter Sunday. */
export const GOOD_FRIDAY_OFFSET = -2
export const FAMILY_DAY_OFFSET = 1

/**
 * Easter Sunday (Anonymous Gregorian algorithm). Good Friday is Easter − 2, Family Day is Easter + 1.
 *
 * Deterministic, so the caretaker can assert that a covered year carries all twelve Schedule-1 holidays
 * rather than merely counting to twelve. In the caretaker it NEVER adds an entry — it only refuses to
 * serve a year that is missing one.
 */
export function easterSundayISO(year: number): string {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10)
}

/** UTC day-of-week. NEVER getDay() — that is local time. 0 = Sunday. */
export function utcDayOfWeek(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00.000Z`).getUTCDay()
}

export function shiftISO(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * A NaN check is not enough: V8 silently ROLLS OVER an out-of-range day inside a valid month, so
 * `new Date("2026-02-30T00:00:00Z")` is 2 March rather than Invalid Date. Only a round-trip catches it.
 */
export function isRealCalendarDay(iso: string): boolean {
  const d = new Date(`${iso}T00:00:00.000Z`)
  if (Number.isNaN(d.getTime())) return false
  return d.toISOString().slice(0, 10) === iso
}
