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
import {
  BASIS_PROCLAMATION,
  BASIS_SHIFT,
  DATE_ONLY,
  FAMILY_DAY_OFFSET,
  GOOD_FRIDAY_OFFSET,
  SCHEDULE_1_FIXED,
  easterSundayISO,
  isRealCalendarDay,
  isScheduleOneFixed,
  shiftISO,
  utcDayOfWeek,
} from "./saHolidayStatute"

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

/**
 * The statute itself — Schedule 1, the computus, s2(1)'s mechanics — moved to `./saHolidayStatute.ts` in
 * ADDENDUM_70L Phase A so the GENERATOR can reach it WITHOUT loading this module. That is load-bearing:
 * validation below runs at module load and throws at boot, so a caretaker-routed import would leave a
 * malformed committed table un-regenerable by the only tool that could fix it.
 *
 * `BASIS_PROCLAMATION` is re-exported unchanged because `holidayAudit.ts` imports it FROM HERE, and the
 * string it keys off must remain the one this module validates against (Rule 5).
 */
export { BASIS_PROCLAMATION }

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
      ...[...SCHEDULE_1_FIXED.keys()].map((mmdd) => `${y}-${mmdd}`),
      shiftISO(easter, GOOD_FRIDAY_OFFSET),
      shiftISO(easter, FAMILY_DAY_OFFSET),
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
      `The table is GENERATED — run \`npm run gen:holidays\`; do NOT hand-edit lib/dates/saHolidays.json ` +
      `(a byte-for-byte diff test rejects any hand-edit). If regenerating does not move the horizon, the ` +
      `next year is one the Public Holidays Act does not settle by itself: record the Government Gazette ` +
      `proclamation in lib/dates/saProclamations.json and lift that year's refusal in ` +
      `lib/dates/saHolidayDerivation.ts. Refusing to compute a statutory deadline against unknown holidays.`,
  )
}

/** Weekends and public holidays are not business days. UTC-anchored. */
function isBusinessDayISO(dateStr: string): boolean {
  const dow = utcDayOfWeek(dateStr)
  if (dow === 0 || dow === 6) return false
  return !isPublicHoliday(dateStr)
}

/**
 * A walker input must be a REAL calendar day, not merely a well-formed string. `assertHolidayCoverage` is a
 * lexical string comparison, so "2026-11-31" passes the range check unharmed — and then `shiftISO` builds
 * `new Date("2026-11-31T00:00:00Z")`, which V8 silently rolls to 1 December, so the walk proceeds from an
 * anchor one day off. That is the exact rollover class the caretaker round-trips every table entry to
 * prevent; the walkers, whose whole identity is "fail closed", must round-trip their inputs the same way.
 */
function assertRealDateOnly(iso: string, fn: string): string {
  if (!DATE_ONLY.test(iso)) {
    throw new TypeError(`${fn}: expected a "YYYY-MM-DD" calendar date, got ${JSON.stringify(iso)}.`)
  }
  if (!isRealCalendarDay(iso)) {
    throw new RangeError(`${fn}: ${JSON.stringify(iso)} is not a real date (the day does not exist in its month).`)
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
  assertRealDateOnly(fromIso, "addBusinessDays")
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
  assertRealDateOnly(fromIso, "subtractBusinessDaysStrict")
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
  assertWholeCount(days, "subtractBusinessDays")
  let cursor = assertRealDateOnly(fromIso, "subtractBusinessDays")
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
