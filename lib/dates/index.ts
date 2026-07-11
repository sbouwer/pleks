/**
 * lib/dates/index.ts — the single place that knows about the business timezone
 *
 * Notes:  FIVE distinct operations live here, and every bug in this area comes from confusing two of them.
 *         Only the first two involve a timezone at all:
 *
 *           1. instant → SA calendar date   saDateISO(at)      a timezone RESOLUTION
 *           2. now → SA calendar date       saTodayISO()       special case of (1)
 *           3. calendar date ± N days       addCalendarDays()  PURE ARITHMETIC — no timezone
 *           4. display formatting           fmtDateZA() etc    must pass timeZone, or it renders in the
 *                                                              SERVER's zone (UTC on Vercel, SAST on a dev box)
 *           5. business days                addBusinessDays()  in ./saPublicHolidays — weekends + holidays
 *
 *         ⚠ `toISOString().slice(0,10)` is operation 1 done WRONG — it resolves in UTC. But the same
 *         expression is CORRECT for operation 3, where the input is already an SA-resolved date parked at
 *         UTC midnight as a carrier. `lib/notices/vacateDate.ts` had both, three lines apart: one was a
 *         Tribunal-grade fail-open, the other was right. Classify per site. Never codemod.
 *
 *         Log timestamps and `created_at` range queries stay UTC. Converting them breaks the range.
 *
 *         FAILS CLOSED. Every entry point validates and throws rather than returning an `Invalid Date`,
 *         because an Invalid Date compares `false` in both directions: a Supabase filter built from one
 *         silently matches nothing and reads as "no rows" rather than as an error. Guard untrusted input
 *         (query params, CSV imports) with isSaDateISO() first.
 *
 *         No date-fns-tz dependency: SAST is UTC+2 with no DST, so the offset is a constant — asserted
 *         against Intl across the year in the test suite rather than assumed.
 */

/** The one timezone this codebase reasons in. SAST = UTC+2, no DST. */
export const SA_TIMEZONE = "Africa/Johannesburg"

/** SAST's fixed UTC offset. No DST — the test suite proves Intl agrees on every month. */
const SA_UTC_OFFSET = "+02:00"

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/
const MS_PER_DAY = 86_400_000

/**
 * Does this string name a day that actually exists?
 *
 * A NaN check is NOT enough: V8 silently ROLLS OVER an out-of-range day inside a valid month —
 * `new Date("2025-02-29T00:00:00Z")` is 1 March, not Invalid Date. Only a round-trip catches it, so a
 * typo'd or imported date cannot land one day off, forever, in silence.
 */
function isRealCalendarDay(iso: string): boolean {
  const d = new Date(`${iso}T00:00:00.000Z`)
  if (Number.isNaN(d.getTime())) return false          // month 13, day 32
  return d.toISOString().slice(0, 10) === iso          // Feb 30 -> "03-02", rejected
}

/** Well-formed "YYYY-MM-DD" naming a day that exists. Use at untrusted boundaries before anything below. */
export function isSaDateISO(value: unknown): value is string {
  return typeof value === "string" && DATE_ONLY.test(value) && isRealCalendarDay(value)
}

function assertSaDateISO(iso: string, fn: string): string {
  if (!DATE_ONLY.test(iso)) {
    throw new TypeError(`${fn}: expected a "YYYY-MM-DD" calendar date, got ${JSON.stringify(iso)}.`)
  }
  if (!isRealCalendarDay(iso)) {
    throw new RangeError(`${fn}: ${JSON.stringify(iso)} is not a real date.`)
  }
  return iso
}

function assertRealInstant(at: Date, fn: string): Date {
  if (!(at instanceof Date) || Number.isNaN(at.getTime())) {
    throw new RangeError(`${fn}: not a real instant.`)
  }
  return at
}

// ── 1 · instant → SA calendar date (a timezone resolution) ────────────────────────────────────────────

/**
 * Resolve an INSTANT to its calendar date in SAST, as "YYYY-MM-DD".
 *
 * This is the operation people reach for `toISOString().slice(0,10)` to do — wrongly. SAST is UTC+2, so
 * anything from 22:00 UTC already belongs to the NEXT South African day. Legal dates on a notice MUST be
 * SAST: a cancellation date computed off toISOString() can pre-date its own service, which is a free
 * argument for a tenant's attorney.
 */
export function saDateISO(at: Date): string {
  assertRealInstant(at, "saDateISO")
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SA_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(at)
}

/** Today's SA calendar date. Prefer saDateISO(at) when you hold an instant — the reader can then see which. */
export function saTodayISO(): string {
  return saDateISO(new Date())
}

/** Do two instants fall on the same SA calendar day? (NOT getDate() — those are local-time accessors.) */
export function isSameSaDay(a: Date, b: Date): boolean {
  return saDateISO(a) === saDateISO(b)
}

// ── 3 · calendar arithmetic (no timezone involved) ────────────────────────────────────────────────────

/**
 * A calendar-date string → its UTC-midnight carrier. Use for date-only columns and as the anchor for
 * calendar arithmetic, so the value is a DAY rather than a moment.
 */
export function calendarDate(iso: string): Date {
  assertSaDateISO(iso, "calendarDate")
  return new Date(`${iso}T00:00:00.000Z`)
}

/** Shift a calendar date by whole days. Pure string→string, so it cannot drift: arithmetic on a UTC anchor. */
export function addCalendarDays(iso: string, days: number): string {
  if (!Number.isInteger(days)) {
    throw new TypeError(`addCalendarDays: days must be a whole number, got ${days}.`)
  }
  const d = calendarDate(iso)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * Shift a calendar date by whole months, on a UTC anchor.
 *
 * ⚠ Overflow ROLLS OVER, matching JS `setUTCMonth` and the local-time code this replaced: 31 Jan + 1 month
 * is 3 March, not 28 February. Whether a lease term should clamp instead is a product decision that has
 * never been made — this function deliberately preserves the existing behaviour rather than silently
 * changing every lease end date. It fixes only the coordinate mixing: the callers used LOCAL setMonth/
 * setDate and then sliced in UTC, so the answer depended on the server's timezone.
 *
 * Open, not permanent: OUTSTANDING.md, "addCalendarMonths rolls over rather than clamping".
 */
export function addCalendarMonths(iso: string, months: number): string {
  if (!Number.isInteger(months)) {
    throw new TypeError(`addCalendarMonths: months must be a whole number, got ${months}.`)
  }
  const d = calendarDate(iso)
  d.setUTCMonth(d.getUTCMonth() + months)
  return d.toISOString().slice(0, 10)
}

/**
 * The first / last calendar day of a date's month.
 *
 * These exist because date-fns `startOfMonth`/`endOfMonth` are LOCAL-time operations returning a `Date`,
 * and every caller then sliced that Date in UTC. On a UTC server the two coordinate systems coincide and
 * the bug is invisible; on any machine east of Greenwich `endOfMonth` yields local 23:59 of the 31st,
 * which is the 31st in UTC — but `startOfMonth` yields local 00:00 of the 1st, which is the LAST DAY OF
 * THE PREVIOUS MONTH in UTC. A whole month of invoices, statements and levies hung off that.
 *
 * `monthEnd` cannot hit the addCalendarMonths rollover: a day-01 anchor has no day to overflow.
 */
export function monthStart(iso: string): string {
  return `${assertSaDateISO(iso, "monthStart").slice(0, 7)}-01`
}

export function monthEnd(iso: string): string {
  return addCalendarDays(addCalendarMonths(monthStart(iso), 1), -1)
}

/**
 * Whole SA calendar days from `from` to `to` (negative if `to` is earlier).
 *
 * NOT a millisecond division: that answers "how many 24-hour spans", so 23:00 Monday → 08:00 Tuesday
 * floors to 0 when the calendar says 1. Reach for this whenever a threshold is phrased in days.
 */
export function diffCalendarDays(from: Date | string, to: Date | string): number {
  const a = calendarDate(typeof from === "string" ? assertSaDateISO(from, "diffCalendarDays") : saDateISO(from))
  const b = calendarDate(typeof to === "string" ? assertSaDateISO(to, "diffCalendarDays") : saDateISO(to))
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY)
}

// ── SA day boundaries, for range queries over real timestamp columns ──────────────────────────────────

/**
 * The instant an SA calendar day BEGINS (00:00 SAST), as a real UTC instant.
 *
 * Pair with saDayStartUtc(addCalendarDays(d, 1)) as an EXCLUSIVE upper bound:
 *   .gte("created_at", saDayStartUtc(d)).lt("created_at", saDayStartUtc(addCalendarDays(d, 1)))
 * There is deliberately no `saDayEnd` — an inclusive 23:59:59 bound silently drops the final 999ms.
 */
export function saDayStartUtc(iso: string): Date {
  assertSaDateISO(iso, "saDayStartUtc")
  return new Date(`${iso}T00:00:00.000${SA_UTC_OFFSET}`)
}

// ── 4 · display formatting (always pass a timeZone) ───────────────────────────────────────────────────

const fmt = (opts: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat("en-ZA", { timeZone: SA_TIMEZONE, ...opts })

/**
 * Coerce a display input to an instant. A date-only string is a DAY, so it renders as that day —
 * its UTC-midnight carrier reads as 02:00 SAST, which is the same calendar date.
 */
function toInstant(value: Date | string, fn: string): Date {
  if (value instanceof Date) return assertRealInstant(value, fn)
  if (DATE_ONLY.test(value)) return calendarDate(value)
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) throw new RangeError(`${fn}: ${JSON.stringify(value)} is not a real date.`)
  return d
}

/**
 * The generic escape hatch: any Intl option bag you like, with `timeZone` injected.
 *
 * Reach for the named helpers below first. This exists so a bespoke shape (a weekday, a day-and-time with
 * no year) never becomes an excuse to call `toLocaleDateString` directly and silently render in the
 * server's zone. One helper, no sprawl.
 */
export function fmtZA(value: Date | string, options: Intl.DateTimeFormatOptions): string {
  return fmt(options).format(toInstant(value, "fmtZA"))
}

/** "8 Jul 2026" — the default for tenant-facing dates. Never `toLocaleDateString()` without a timeZone. */
export function fmtDateZA(value: Date | string): string {
  return fmt({ day: "numeric", month: "short", year: "numeric" }).format(toInstant(value, "fmtDateZA"))
}

/** "8 July 2026" — long form, for legal instruments and letters. */
export function fmtDateLongZA(value: Date | string): string {
  return fmt({ day: "numeric", month: "long", year: "numeric" }).format(toInstant(value, "fmtDateLongZA"))
}

/** "8 Jul 2026, 14:30" — an instant rendered in SAST. */
export function fmtDateTimeZA(value: Date | string): string {
  return fmt({
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(toInstant(value, "fmtDateTimeZA"))
}

// ── 5 · business days — re-exported so callers need one import ────────────────────────────────────────
export {
  addBusinessDays, subtractBusinessDays, subtractBusinessDaysStrict, isPublicHoliday,
  isWithinHolidayHorizon, HOLIDAY_TABLE_COVERS_FROM, HOLIDAY_TABLE_COVERS_THROUGH,
} from "./saPublicHolidays"
