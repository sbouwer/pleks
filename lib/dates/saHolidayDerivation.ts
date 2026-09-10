/**
 * lib/dates/saHolidayDerivation.ts — derives Schedule 1 for any year, and REFUSES where the law does not
 *
 * ⚠ THE GENERATOR IS AUTHORITATIVE; THE COMMITTED TABLE IS DERIVED (ADDENDUM_70L A3). This module is the
 *   authority: `saHolidays.json` is its output, re-derived and diffed by `saHolidayDerivation.test.ts` so
 *   the two copies cannot drift. Edit the derivation, never the JSON.
 *
 *   Twelve of the twelve Schedule-1 holidays are computable — ten fixed MM-DD dates plus Good Friday and
 *   Family Day off the computus — as is the s2(1) Sunday→Monday shift. What is NOT computable is a s2A
 *   presidential proclamation, which arrives by Government Gazette and enters through
 *   `./saProclamations.json` as a human act with a citation (D-7d).
 *
 * ⚠ REFUSAL IS THE POINT, NOT AN EDGE CASE. Where the Act's application is not mechanically determined
 *   this module THROWS rather than picking a reading. A naive Set-based derivation would silently emit
 *   ONE FEWER HOLIDAY than a human would query — a fail-open that looks like a clean run, which is the
 *   exact failure ADDENDUM_70L exists to close. Every refusal names the Gazette step that resolves it.
 *
 * Notes:  The horizon is a CONSEQUENCE, not a setting. `deriveHolidayTable` walks forward until it hits a
 *         year it must refuse and covers through the year before it, so `coversThrough` means "the last
 *         year the statute determines on its own" instead of "how far someone typed". Today that is 2032,
 *         because Christmas 2033 falls on a Sunday (D-7f).
 */
import {
  BASIS_PROCLAMATION,
  BASIS_SCHEDULE_1,
  BASIS_SHIFT,
  FAMILY_DAY_OFFSET,
  GOOD_FRIDAY_OFFSET,
  SCHEDULE_1_FIXED,
  easterSundayISO,
  isRealCalendarDay,
  isScheduleOneFixed,
  shiftISO,
  utcDayOfWeek,
} from "./saHolidayStatute"
import type { HolidayEntry, HolidayTable } from "./saPublicHolidays"

/**
 * Thrown when the statute does not determine the answer. Distinct from the caretaker's
 * `HolidayTableError`, which means "the committed file is malformed" — this one means "the law needs
 * reading, by a human, against the Gazette."
 */
export class HolidayDerivationError extends Error {
  constructor(message: string) {
    super(`SA holiday derivation refused — ${message}`)
    this.name = "HolidayDerivationError"
  }
}

/** A s2A row as it is carried by hand in `saProclamations.json`. */
export interface Proclamation {
  date: string
  name: string
  /** Government Gazette reference. The caretaker's Rule 5 requires it; so do we, one step earlier. */
  source: string
}

/** ISO YYYY-MM-DD sorts lexicographically, so a plain comparison is also a chronological one. */
function byDateAscending(a: HolidayEntry, b: HolidayEntry): number {
  if (a.date < b.date) return -1
  if (a.date > b.date) return 1
  return 0
}

/**
 * The twelve Schedule-1 holidays for a year, BEFORE the s2(1) Sunday rule is applied.
 *
 * Refuses collision class (b): two Schedule-1 holidays on one calendar day. The only occurrence in
 * 2000–2060 is 2008, when Good Friday fell on 21 March (Human Rights Day); the next is past 2060. The
 * caretaker would also catch this downstream, but its message — "appears twice. Remove the duplicate." —
 * MISDIRECTS a generator, which has no duplicate to remove: two statutory holidays genuinely coincide and
 * the Act does not say whether the day is doubled or absorbed.
 */
export function scheduleOneForYear(year: number): HolidayEntry[] {
  const entries: HolidayEntry[] = []
  const seen = new Map<string, string>()

  const add = (date: string, name: string) => {
    const clash = seen.get(date)
    if (clash !== undefined) {
      throw new HolidayDerivationError(
        `${year}: "${clash}" and "${name}" both fall on ${date}. Two Schedule-1 holidays on one calendar ` +
          `day is a reading the Act does not settle — whether the year gains a further day is a legal ` +
          `question, not a computation. Resolve it against the Government Gazette and carry the answer ` +
          `as an explicit entry, the way an s2A proclamation is carried.`,
      )
    }
    seen.set(date, name)
    entries.push({ date, name, basis: BASIS_SCHEDULE_1, observedShiftOf: null, source: null })
  }

  for (const [mmdd, name] of SCHEDULE_1_FIXED) add(`${year}-${mmdd}`, name)

  const easter = easterSundayISO(year)
  add(shiftISO(easter, GOOD_FRIDAY_OFFSET), "Good Friday")
  add(shiftISO(easter, FAMILY_DAY_OFFSET), "Family Day")

  return entries.sort(byDateAscending)
}

/**
 * PHA s2(1): "whenever any public holiday falls on a Sunday, the following Monday shall be a public
 * holiday." SATURDAY holidays are NOT shifted.
 *
 * Refuses collision class (a) — the design driver. If the Monday is ALREADY a public holiday, s2(1) has
 * no work to do (D-7f) and no observed entry may exist for it; the caretaker's Rule 4-reverse enforces
 * exactly that and would reject a fabricated shift. But the derivation cannot simply skip it either: the
 * year then carries one fewer holiday than reality, because historically the gap was filled by a SEPARATE
 * s2A proclamation on the following day — an act of the President that no algorithm can predict.
 *
 * So we refuse. The only Schedule-1 adjacent pair is 25→26 December, so this bites whenever Christmas
 * falls on a Sunday: 2022 (past), next 2033, then 2039, 2044, 2050.
 */
function applySundayRule(base: HolidayEntry[]): HolidayEntry[] {
  const occupied = new Map(base.map((h) => [h.date, h]))
  const shifts: HolidayEntry[] = []

  for (const h of base) {
    if (utcDayOfWeek(h.date) !== 0) continue

    const monday = shiftISO(h.date, 1)
    const blocker = occupied.get(monday)

    if (blocker !== undefined) {
      const isD7f = isScheduleOneFixed(monday)
      throw new HolidayDerivationError(
        `${h.date} ("${h.name}") falls on a Sunday, but its s2(1) Monday ${monday} is already ` +
          `"${blocker.name}". s2(1) has no work to do${isD7f ? " (D-7f)" : ""}, so no observed entry may ` +
          `exist — yet skipping it would leave the year ONE HOLIDAY SHORT of what a person would be told, ` +
          `because the gap has historically been filled by a separate s2A proclamation on the following ` +
          `day. That is a presidential act, not a computation. Read the Government Gazette for ${h.date.slice(0, 4)} ` +
          `and carry the answer in saProclamations.json; the table cannot honestly reach this year until then.`,
      )
    }

    shifts.push({
      date: monday,
      name: `${h.name} (observed)`,
      basis: BASIS_SHIFT,
      observedShiftOf: h.date,
      source: null,
    })
    occupied.set(monday, shifts[shifts.length - 1])
  }

  return shifts
}

/** Every Schedule-1 holiday for a year, shifts included. Throws on either collision class. */
export function deriveYear(year: number): HolidayEntry[] {
  const base = scheduleOneForYear(year)
  return [...base, ...applySundayRule(base)].sort(byDateAscending)
}

/** Whether a year derives cleanly. Used to find the horizon; never to silence a refusal. */
export function isDerivableYear(year: number): boolean {
  try {
    deriveYear(year)
    return true
  } catch (err) {
    if (err instanceof HolidayDerivationError) return false
    throw err
  }
}

/**
 * The first year at or after `fromYear` the statute does not determine on its own.
 *
 * This is what gives `coversThrough` a REASON. `scanLimit` bounds the walk so a pathological input cannot
 * spin; it is not a policy horizon, and reaching it is itself a refusal.
 */
export function firstUndeterminedYear(fromYear: number, scanLimit = fromYear + 100): number {
  for (let year = fromYear; year <= scanLimit; year++) {
    if (!isDerivableYear(year)) return year
  }
  throw new HolidayDerivationError(
    `no undetermined year found between ${fromYear} and ${scanLimit}. That is not a clean bill of health — ` +
      `it means the scan limit was reached, so the horizon would be an artefact of this number rather than ` +
      `of the statute. Widen the scan deliberately or shorten the window.`,
  )
}

export interface DeriveOptions {
  /** First year the table answers for. */
  fromYear: number
  /** Hand-carried s2A rows, in date order or not — they are merged and re-sorted. */
  proclamations?: readonly Proclamation[]
  /** Bound on the forward walk. See `firstUndeterminedYear`. */
  scanLimit?: number
}

/**
 * Build the whole table: derived Schedule-1 rows for every year the statute determines, plus the
 * hand-carried s2A proclamations that fall inside that window.
 *
 * The window's END is derived, not chosen — see this file's header.
 */
export function deriveHolidayTable(options: DeriveOptions): HolidayTable {
  const { fromYear, proclamations = [], scanLimit } = options

  if (!isDerivableYear(fromYear)) {
    // Surface the year's own refusal rather than a generic "bad start year".
    deriveYear(fromYear)
  }

  const undetermined = firstUndeterminedYear(fromYear, scanLimit)
  const throughYear = undetermined - 1

  const holidays: HolidayEntry[] = []
  for (let year = fromYear; year <= throughYear; year++) holidays.push(...deriveYear(year))

  const coversFrom = `${fromYear}-01-01`
  const coversThrough = `${throughYear}-12-31`
  const byDate = new Map(holidays.map((h) => [h.date, h]))

  for (const p of proclamations) {
    // `name` is read from JSON, so the Proclamation type does not bind it at runtime. It was the one
    // field of the hand-carried half with no guard: a null name renders straight into saHolidays.json,
    // passes all six caretaker rules (Rule 5 types `source`, nothing types `name`), and only surfaces
    // downstream where holidayAudit.normaliseName calls .split("(") on it. Guard it FIRST — every other
    // refusal below interpolates p.name into its own message.
    if (typeof p.name !== "string" || p.name.trim() === "") {
      throw new HolidayDerivationError(
        `proclamation on ${p.date} has no name. A holiday nobody can name cannot be reconciled against ` +
          `the Gazette, and the auditor matches on name.`,
      )
    }
    if (!isRealCalendarDay(p.date)) {
      throw new HolidayDerivationError(`proclamation "${p.name}" has a date that is not a real day: ${p.date}.`)
    }
    if (p.source.trim() === "") {
      throw new HolidayDerivationError(
        `proclamation "${p.name}" on ${p.date} carries no Gazette reference. A presidential proclamation ` +
          `without one is a rumour (the caretaker's Rule 5 refuses it too).`,
      )
    }
    if (p.date < coversFrom || p.date > coversThrough) {
      throw new HolidayDerivationError(
        `proclamation "${p.name}" on ${p.date} falls outside the derived window ${coversFrom}..${coversThrough}, ` +
          `so the table cannot carry it. The window ends where the statute stops determining itself ` +
          `(${undetermined} needs a Gazette reading) — resolve that year rather than widening the window ` +
          `around this row.`,
      )
    }

    const clash = byDate.get(p.date)
    if (clash !== undefined) {
      throw new HolidayDerivationError(
        `proclamation "${p.name}" falls on ${p.date}, which is already "${clash.name}" (${clash.basis}). ` +
          `Whether a proclaimed day that coincides with an existing holiday grants a further day is a ` +
          `legal reading, not a computation. Resolve it against the Gazette.`,
      )
    }

    if (utcDayOfWeek(p.date) === 0) {
      throw new HolidayDerivationError(
        `proclamation "${p.name}" falls on a SUNDAY (${p.date}). Whether s2(1) then makes the following ` +
          `Monday a public holiday too — s2(1) speaks of "any public holiday", and s2A creates one — is a ` +
          `reading of the Act, not a computation. Resolve it against the Gazette and carry both days ` +
          `explicitly if that is the answer.`,
      )
    }

    const entry: HolidayEntry = {
      date: p.date,
      name: p.name,
      basis: BASIS_PROCLAMATION,
      observedShiftOf: null,
      source: p.source,
    }
    holidays.push(entry)
    byDate.set(p.date, entry)
  }

  return { coversFrom, coversThrough, holidays: holidays.sort(byDateAscending) }
}

/**
 * First year the table answers for. Moving this REWRITES history — read ADDENDUM_70L before you do.
 *
 * Lives here rather than in the codegen script so the TEST and the WRITER cannot disagree about it: the
 * test's whole job is to prove the committed file is what this module produces, which it cannot do if the
 * start year is a property of the script instead.
 */
export const COVERAGE_FROM_YEAR = 2025

const GENERATED_README =
  "DATA ONLY, AND GENERATED — do not hand-edit. Produced by scripts/codegen/gen-sa-holidays.mts from " +
  "lib/dates/saHolidayDerivation.ts (the statute) plus lib/dates/saProclamations.json (the s2A rows a " +
  "human carries, each with its Gazette reference). lib/dates/saHolidayDerivation.test.ts re-derives and " +
  "diffs this file on every `npm run check`, so an edit here fails the gate rather than surviving. The " +
  "caretaker is lib/dates/saPublicHolidays.ts — it validates this file at MODULE LOAD and throws at boot " +
  "on any violation. Never write it at runtime: it is a build-time import, bundled and immutable in the " +
  "deployed artifact, and change detection is git. 'PHA' = Public Holidays Act 36 of 1994. coversThrough " +
  "is DERIVED — the last year the statute determines on its own, not a typed horizon. See ADDENDUM_70L."

/**
 * Render the table as the committed JSON file, with aligned columns.
 *
 * `JSON.stringify(…, 2)` would put every field on its own line and make a several-hundred-row compliance
 * artefact unreadable as a table — and readability is the whole reason the flat file exists beside the
 * derivation (A3). Column widths are computed from the content, so output stays deterministic, which is
 * what lets the test diff it byte-for-byte.
 */
export function renderHolidayTableJson(table: HolidayTable): string {
  const cells = table.holidays.map((h) => ({
    date: JSON.stringify(h.date),
    name: JSON.stringify(h.name),
    basis: JSON.stringify(h.basis),
    shift: JSON.stringify(h.observedShiftOf),
    source: JSON.stringify(h.source),
  }))

  const widest = (pick: (c: (typeof cells)[number]) => string) =>
    cells.reduce((max, c) => Math.max(max, pick(c).length), 0)
  const nameWidth = widest((c) => c.name)
  const basisWidth = widest((c) => c.basis)
  const shiftWidth = widest((c) => c.shift)

  const rows = cells.map(
    (c) =>
      `    { "date": ${c.date}, "name": ${c.name.padEnd(nameWidth)}, "basis": ${c.basis.padEnd(basisWidth)}, ` +
      `"observedShiftOf": ${c.shift.padEnd(shiftWidth)}, "source": ${c.source} }`,
  )

  return (
    "{\n" +
    `  "_readme": ${JSON.stringify(GENERATED_README)},\n` +
    `  "coversFrom": ${JSON.stringify(table.coversFrom)},\n` +
    `  "coversThrough": ${JSON.stringify(table.coversThrough)},\n` +
    `  "holidays": [\n${rows.join(",\n")}\n  ]\n` +
    "}\n"
  )
}
