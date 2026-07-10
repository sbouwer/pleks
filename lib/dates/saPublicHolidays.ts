/**
 * lib/dates/saPublicHolidays.ts — the CARETAKER of the SA public-holiday table (ADDENDUM_70K Phase A)
 *
 * ⚠ THE TABLE IS A COMPLIANCE ARTEFACT, NOT A CODE ARTEFACT. It lives in `./saHolidays.json`; this module
 *   validates it, asserts its statutory semantics, and serves it. It stores nothing (D-7a).
 *
 *   Two things move the table, and both are human acts with a paper trail:
 *
 *   1. Public Holidays Act 36 of 1994, **s2(1)**: "whenever any public holiday falls on a Sunday, the
 *      following Monday shall be a public holiday." SATURDAY holidays are NOT shifted.
 *      **D-7f carve-out:** if that Monday is *independently* a public holiday, s2(1) has no work to do and
 *      no observed entry may exist for it. The only Schedule-1 adjacent pair is 25→26 Dec, so this bites
 *      whenever Christmas falls on a Sunday (2022, next 2033). Historically the gap was filled by a
 *      separate s2A proclamation on the 27th — carried as its own entry, never as a fabricated shift.
 *   2. Once-off holidays PROCLAIMED BY THE PRESIDENT under **s2A** (election days have done this). A
 *      proclaimed day missing from the table is a fail-open in miniature: cure period one day short,
 *      notice served one day early. Every s2A entry must carry its Gazette reference.
 *
 *   Source of truth: the Act's Schedule 1 + Government Gazette proclamations. An API is an AUDITOR, never
 *   an authority (D-7d) — there is no runtime mutation channel, and there never will be.
 *
 * Notes:  Validation runs at MODULE LOAD and throws at boot. A malformed table must never serve a request;
 *         tests-only validation would let a bad edit reach production and answer questions wrongly.
 *
 *         All arithmetic is UTC-anchored on YYYY-MM-DD strings. Never getDay()/setDate() here — those are
 *         LOCAL-time accessors, so they mean UTC on Vercel and SAST on a dev machine.
 *
 *         Past the horizon, statutory paths THROW (a forgotten table update must be a loud outage, never a
 *         silently shortened cure period) while the advisory path warns and degrades. Both walkers exist in
 *         both directions — see addBusinessDays / subtractBusinessDaysStrict (statutory) vs
 *         subtractBusinessDays (advisory, display only).
 */
import holidaysData from "./saHolidays.json"

export interface HolidayEntry {
  date: string
  name: string
  /** Statutory citation. "PHA s1 Sch 1" | "PHA s2(1)" | "PHA s2A". Required, non-empty. */
  basis: string
  /** An observed Monday points at the Sunday it shifts. This is what makes s2(1) machine-checkable. */
  observedShiftOf: string | null
  /** Government Gazette reference. REQUIRED for every s2A entry; null allowed otherwise. */
  source: string | null
}

export interface HolidayTable {
  coversFrom: string
  coversThrough: string
  holidays: HolidayEntry[]
}

const BASIS_SHIFT = "PHA s2(1)"
const BASIS_PROCLAMATION = "PHA s2A"

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

/**
 * Schedule 1's TEN fixed-date holidays, as MM-DD. (The other two — Good Friday and Family Day — move with
 * Easter and are derived below.) This set is what makes the D-7f carve-out checkable in BOTH directions:
 * the caretaker must know that 26 December is a public holiday in its own right, or it cannot tell a
 * legitimate s2(1) shift from a fabricated one landing on Day of Goodwill.
 */
const SCHEDULE_1_FIXED_MMDD = new Set([
  "01-01", // New Year's Day
  "03-21", // Human Rights Day
  "04-27", // Freedom Day
  "05-01", // Workers' Day
  "06-16", // Youth Day
  "08-09", // National Women's Day
  "09-24", // Heritage Day
  "12-16", // Day of Reconciliation
  "12-25", // Christmas Day
  "12-26", // Day of Goodwill
])

const isScheduleOneFixed = (iso: string) => SCHEDULE_1_FIXED_MMDD.has(iso.slice(5))

/**
 * Easter Sunday (Anonymous Gregorian algorithm). Good Friday is Easter − 2, Family Day is Easter + 1.
 *
 * Deterministic, so the caretaker can assert that a covered year carries all twelve Schedule-1 holidays
 * rather than merely counting to twelve. It NEVER adds an entry — it only refuses to serve a year that is
 * missing one. Computing a holiday and proclaiming one are different acts (D-7d).
 */
function easterSundayISO(year: number): string {
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
function utcDayOfWeek(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00.000Z`).getUTCDay()
}

function shiftISO(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * A NaN check is not enough: V8 silently ROLLS OVER an out-of-range day inside a valid month, so
 * `new Date("2026-02-30T00:00:00Z")` is 2 March rather than Invalid Date. Only a round-trip catches it.
 */
function isRealCalendarDay(iso: string): boolean {
  const d = new Date(`${iso}T00:00:00.000Z`)
  if (Number.isNaN(d.getTime())) return false
  return d.toISOString().slice(0, 10) === iso
}

class HolidayTableError extends Error {
  constructor(message: string) {
    super(`saHolidays.json is invalid — ${message}`)
    this.name = "HolidayTableError"
  }
}

/** Rule 0 — the coverage window is itself a pair of real dates, the right way round. */
function assertCoverageBounds({ coversFrom, coversThrough, holidays }: HolidayTable): void {
  for (const bound of [coversFrom, coversThrough]) {
    if (!DATE_ONLY.test(bound) || !isRealCalendarDay(bound)) {
      throw new HolidayTableError(`coverage bound ${JSON.stringify(bound)} is not a real YYYY-MM-DD date.`)
    }
  }
  if (coversFrom > coversThrough) {
    throw new HolidayTableError(`coversFrom (${coversFrom}) is after coversThrough (${coversThrough}).`)
  }
  if (holidays.length === 0) throw new HolidayTableError("the table is empty.")
}

/** Rules 1–3 — real dates, sorted, unique, in window, each with a basis. Returns the date index. */
function assertStructure({ coversFrom, coversThrough, holidays }: HolidayTable): Map<string, HolidayEntry> {
  const byDate = new Map<string, HolidayEntry>()
  let previous = ""
  for (const h of holidays) {
    if (!DATE_ONLY.test(h.date) || !isRealCalendarDay(h.date)) {
      throw new HolidayTableError(`${JSON.stringify(h.date)} is not a real YYYY-MM-DD date. Fix the entry.`)
    }
    if (h.date === previous) throw new HolidayTableError(`${h.date} appears twice. Remove the duplicate.`)
    if (h.date < previous) {
      throw new HolidayTableError(`${h.date} is out of order (follows ${previous}). Sort holidays ascending.`)
    }
    if (h.date < coversFrom || h.date > coversThrough) {
      throw new HolidayTableError(
        `${h.date} lies outside the coverage window ${coversFrom}..${coversThrough}. ` +
          `Widen coversFrom/coversThrough, or remove the entry.`,
      )
    }
    if (typeof h.basis !== "string" || h.basis.trim() === "") {
      throw new HolidayTableError(`${h.date} has no 'basis'. Every entry needs its statutory citation.`)
    }
    previous = h.date
    byDate.set(h.date, h)
  }
  return byDate
}

/**
 * Rule 4, forward — every Sunday holiday's Monday exists and points back at it.
 *
 * D-7f carve-out: unless that Monday is a public holiday in its own right, in which case s2(1) has no work
 * to do and no observed entry may exist for it.
 */
function assertSundayShiftsPresent(holidays: HolidayEntry[], byDate: Map<string, HolidayEntry>): void {
  for (const h of holidays) {
    if (h.observedShiftOf !== null) continue        // shift entries are checked in the reverse pass
    if (utcDayOfWeek(h.date) !== 0) continue        // not a Sunday — s2(1) is silent

    const monday = shiftISO(h.date, 1)
    const existing = byDate.get(monday)

    // The carve-out. `isScheduleOneFixed` is checked BEFORE presence, so a table that has simply *lost*
    // its 26 December entry is not told to re-add it as a shift — rule 6 names that as the missing
    // Schedule-1 holiday it is.
    if (isScheduleOneFixed(monday)) continue
    if (existing?.basis === BASIS_PROCLAMATION) continue

    if (!existing) {
      throw new HolidayTableError(
        `${h.date} (${h.name}) falls on a Sunday, so PHA s2(1) makes ${monday} a public holiday, ` +
          `but ${monday} is missing. Add it with basis "${BASIS_SHIFT}" and observedShiftOf "${h.date}".`,
      )
    }
    if (existing.observedShiftOf !== h.date) {
      throw new HolidayTableError(
        `${monday} should be the observed Monday for ${h.date}, but its observedShiftOf is ` +
          `${JSON.stringify(existing.observedShiftOf)}.`,
      )
    }
  }
}

/**
 * Rule 4, reverse — every shift entry is a well-formed, non-orphaned shift of a real Sunday.
 *
 * D-7f mirror: a shift may NOT land on a Schedule-1 fixed date. Without this the caretaker cannot tell a
 * legitimate observed Monday from a fabricated one: giving 2022-12-26 (Day of Goodwill) `basis: "PHA s2(1)"`
 * and `observedShiftOf: "2022-12-25"` satisfies every other rule — the Sunday is real, it is one day
 * earlier, and it is in the table — while asserting that Day of Goodwill is not a holiday in its own right.
 */
function assertShiftEntriesWellFormed(holidays: HolidayEntry[], byDate: Map<string, HolidayEntry>): void {
  for (const h of holidays) {
    if (h.observedShiftOf === null) continue

    if (h.basis !== BASIS_SHIFT) {
      throw new HolidayTableError(
        `${h.date} declares observedShiftOf but its basis is "${h.basis}". Only "${BASIS_SHIFT}" entries shift.`,
      )
    }
    if (isScheduleOneFixed(h.date)) {
      throw new HolidayTableError(
        `${h.date} is a Schedule-1 public holiday in its own right, so it cannot ALSO be an s2(1) shift of ` +
          `${h.observedShiftOf}. When a Sunday holiday's Monday is already a holiday, s2(1) has no work to ` +
          `do — the historical gap-filler is a separate s2A proclamation on the following day, carried as ` +
          `its own entry with a Gazette source. (D-7f: this is the 2022 / 2033 Christmas-on-Sunday case.)`,
      )
    }
    const sunday = h.observedShiftOf
    if (shiftISO(sunday, 1) !== h.date) {
      throw new HolidayTableError(
        `${h.date} claims to be the observed Monday for ${sunday}, which is not the preceding day.`,
      )
    }
    if (utcDayOfWeek(sunday) !== 0) {
      throw new HolidayTableError(
        `${h.date} claims to shift ${sunday}, but ${sunday} is not a Sunday. ` +
          `PHA s2(1) shifts Sundays only — Saturday holidays are NOT shifted.`,
      )
    }
    if (!byDate.has(sunday)) {
      throw new HolidayTableError(`${h.date} shifts ${sunday}, which is not itself in the table. Orphaned shift.`)
    }
  }
}

/** Rule 5 — a presidential proclamation without a Gazette reference is a rumour. */
function assertProclamationSources(holidays: HolidayEntry[]): void {
  for (const h of holidays) {
    if (h.basis !== BASIS_PROCLAMATION) continue
    if (typeof h.source !== "string" || h.source.trim() === "") {
      throw new HolidayTableError(
        `${h.date} has basis "${BASIS_PROCLAMATION}" but no 'source'. ` +
          `A presidential proclamation must cite its Government Gazette reference.`,
      )
    }
  }
}

/**
 * Rule 6 — every FULLY covered year carries all twelve Schedule-1 holidays.
 *
 * Stronger than the `>= 12` sanity floor the spec asked for, and strictly cheaper to trust: counting to
 * twelve passes a year that has thirteen entries and is missing Christmas. Good Friday and Family Day are
 * derived from Easter, which is deterministic — so this asserts presence without ever asserting a
 * proclamation, which remains a human act with a paper trail (D-7d).
 */
function assertYearCoverage({ coversFrom, coversThrough, holidays }: HolidayTable): void {
  const firstFull = coversFrom.endsWith("-01-01") ? Number(coversFrom.slice(0, 4)) : Number(coversFrom.slice(0, 4)) + 1
  const lastFull = coversThrough.endsWith("-12-31") ? Number(coversThrough.slice(0, 4)) : Number(coversThrough.slice(0, 4)) - 1

  const present = new Set(holidays.map((h) => h.date))
  for (let y = firstFull; y <= lastFull; y++) {
    const count = holidays.filter((h) => h.date.startsWith(`${y}-`)).length
    if (count < 12) {
      throw new HolidayTableError(
        `${y} carries only ${count} entries. South Africa has 12 Schedule-1 public holidays before any ` +
          `s2(1) shift — a year below 12 is a botched edit, not a quiet year.`,
      )
    }
    const easter = easterSundayISO(y)
    const required = [
      ...[...SCHEDULE_1_FIXED_MMDD].map((mmdd) => `${y}-${mmdd}`),
      shiftISO(easter, -2), // Good Friday
      shiftISO(easter, 1),  // Family Day
    ]
    for (const day of required) {
      if (!present.has(day)) {
        throw new HolidayTableError(
          `${y} is fully covered but ${day} is missing — that is a Schedule-1 public holiday. ` +
            `A covered year must carry all twelve.`,
        )
      }
    }
  }
}

/**
 * Validate the table. Called at module load; exported so each violation class can be pinned by a fixture.
 *
 * Throws on the FIRST violation, naming the offending entry and its own fix. Order matters: the structural
 * rules run before the semantic ones, so a semantic error message can trust the shape it is reading.
 */
export function validateHolidayTable(table: HolidayTable): void {
  assertCoverageBounds(table)
  const byDate = assertStructure(table)
  assertSundayShiftsPresent(table.holidays, byDate)
  assertShiftEntriesWellFormed(table.holidays, byDate)
  assertProclamationSources(table.holidays)
  assertYearCoverage(table)
}

// ── Boot gate. A malformed table must never serve a request. ──────────────────────────────────────────
const TABLE = holidaysData as HolidayTable
validateHolidayTable(TABLE)

/** The first day this table can answer for. Below it, holidays are unknown, not absent. */
export const HOLIDAY_TABLE_COVERS_FROM = TABLE.coversFrom
/** The last day this table can answer for. Past it, holidays are unknown, not absent. */
export const HOLIDAY_TABLE_COVERS_THROUGH = TABLE.coversThrough

const ALL_HOLIDAYS = new Set(TABLE.holidays.map((h) => h.date))

/** The validated entries, for the auditor (ADDENDUM_70K Phase B) and for tests. Read-only. */
export const SA_PUBLIC_HOLIDAYS: readonly HolidayEntry[] = TABLE.holidays

/**
 * Every covered holiday date, flat. Replaces the old per-year `SA_PUBLIC_HOLIDAYS_2025/6/7` exports — the
 * per-year shape was an artefact of the data living in TypeScript, and it would have needed a new export
 * for every backfilled year.
 */
export const SA_PUBLIC_HOLIDAY_DATES: readonly string[] = TABLE.holidays.map((h) => h.date)

/** Lookup only. Answers "false" for an uncovered date — callers must range-check first. */
export function isPublicHoliday(dateStr: string): boolean {
  return ALL_HOLIDAYS.has(dateStr)
}

/** Is `dateStr` inside the table's horizon? Outside it, `isPublicHoliday` means "unknown", not "no". */
export function isWithinHolidayHorizon(dateStr: string): boolean {
  return dateStr >= HOLIDAY_TABLE_COVERS_FROM && dateStr <= HOLIDAY_TABLE_COVERS_THROUGH
}

/**
 * Fail CLOSED for statutory computations. An error that states its own fix.
 *
 * A forgotten table update becomes a loud outage — which costs a support ticket — instead of a silently
 * shortened cure period, which costs a tenant their lawful cure window and the landlord the validity of
 * the notice. The wrongness is strictly worse than the downtime.
 */
export function assertHolidayCoverage(dateStr: string, fn: string): void {
  if (isWithinHolidayHorizon(dateStr)) return
  throw new RangeError(
    `${fn}: ${dateStr} is outside the SA public-holiday table ` +
      `(${HOLIDAY_TABLE_COVERS_FROM}..${HOLIDAY_TABLE_COVERS_THROUGH}). ` +
      `Extend lib/dates/saHolidays.json and check the Government Gazette for newly proclaimed once-off ` +
      `holidays. Refusing to compute a statutory deadline against unknown holidays.`,
  )
}

/** Weekends and public holidays are not business days. UTC-anchored. */
export function isBusinessDayISO(dateStr: string): boolean {
  const dow = utcDayOfWeek(dateStr)
  if (dow === 0 || dow === 6) return false
  return !isPublicHoliday(dateStr)
}

function assertDateOnly(iso: string, fn: string): string {
  if (!DATE_ONLY.test(iso)) {
    throw new TypeError(`${fn}: expected a "YYYY-MM-DD" calendar date, got ${JSON.stringify(iso)}.`)
  }
  return iso
}

function assertWholeCount(n: number, fn: string): void {
  if (!Number.isInteger(n) || n < 0) {
    throw new TypeError(`${fn}: n must be a non-negative whole number, got ${n}.`)
  }
}

/**
 * STATUTORY. Add `n` business days to a YYYY-MM-DD date — weekends AND SA public holidays excluded, per
 * the CPA's "business day". Throws past the table's horizon rather than degrading to weekends-only.
 *
 * The previous implementation lived in lib/notices/preconditions.ts and counted weekends only, so a cure
 * period spanning any public holiday expired EARLY — and the Rule 1 guard (`if expiry > today → block`)
 * therefore stopped blocking early, letting a Demand to Vacate issue before the tenant's lawful cure
 * window had run. Fail-open on the exact guard built to prevent it.
 */
export function addBusinessDays(fromIso: string, n: number): string {
  assertWholeCount(n, "addBusinessDays")
  assertHolidayCoverage(fromIso, "addBusinessDays")
  let cursor = fromIso
  let added = 0
  while (added < n) {
    cursor = shiftISO(cursor, 1)
    if (isBusinessDayISO(cursor)) added++
  }
  assertHolidayCoverage(cursor, "addBusinessDays")   // the walk may have crossed the horizon
  return cursor
}

/**
 * STATUTORY. Subtract `n` business days — the mirror of addBusinessDays, with the same both-ends horizon
 * discipline. This is what the CPA s14(2)(b)(ii) window (40–80 business days before expiry) must call.
 *
 * It exists because there was no statutory BACKWARD walker (ADDENDUM_70K, D-7g). The only backward walker
 * was the advisory one below, and reaching for it on a statutory path silently degrades the walk to
 * weekends-only past the horizon — computing a legal deadline against holidays it has decided are absent.
 * That is the fail-open this function exists to forbid. If it throws, extend the table; do not downgrade
 * the caller.
 */
export function subtractBusinessDaysStrict(fromIso: string, n: number): string {
  assertWholeCount(n, "subtractBusinessDaysStrict")
  assertHolidayCoverage(fromIso, "subtractBusinessDaysStrict")
  let cursor = fromIso
  let removed = 0
  while (removed < n) {
    cursor = shiftISO(cursor, -1)
    if (isBusinessDayISO(cursor)) removed++
  }
  assertHolidayCoverage(cursor, "subtractBusinessDaysStrict")   // the walk may have crossed the horizon
  return cursor
}

/**
 * ADVISORY — DISPLAY PATHS ONLY. Statutory paths use `subtractBusinessDaysStrict`; degrading a statutory
 * walk to weekends-only is a fail-open (D-7g).
 *
 * Deliberately does NOT throw past the horizon: it is called with lease end dates that legitimately sit
 * years out, and a thrown error would blank the agent's calendar rather than protect anyone. Its failure
 * mode is a reminder one day off, not an unlawful notice. It warns instead, and the horizon sentinel is
 * what actually keeps the table current.
 *
 * String in, string out — matching addBusinessDays. It used to take and return a `Date`, so every caller
 * wrapped a date-only column in `new Date(...)` and then sliced the result back, and each of those hops
 * was a chance to slice an INSTANT (a timezone resolution) rather than a carrier (arithmetic).
 */
export function subtractBusinessDays(fromIso: string, days: number): string {
  let cursor = assertDateOnly(fromIso, "subtractBusinessDays")
  let warned = false
  let remaining = days
  while (remaining > 0) {
    cursor = shiftISO(cursor, -1)
    if (!warned && !isWithinHolidayHorizon(cursor)) {
      console.warn(
        `[saPublicHolidays] subtractBusinessDays walked past the holiday table at ${cursor} — ` +
          `treating public holidays as absent. Extend the table (advisory path, not statutory).`,
      )
      warned = true
    }
    if (isBusinessDayISO(cursor)) remaining--
  }
  return cursor
}
