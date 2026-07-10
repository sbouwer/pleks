/**
 * lib/dates/saPublicHolidays.ts — SA public holidays + business-day arithmetic (CPA s14 deadlines)
 *
 * ⚠ THIS TABLE IS A COMPLIANCE PROCESS, NOT A CODE ARTEFACT. It has a review cadence, and letting it
 *   go stale silently shortens a tenant's statutory cure period. Two things move it:
 *
 *   1. The Public Holidays Act 36 of 1994, s2(1): "whenever any public holiday falls on a Sunday, the
 *      following Monday shall be a public holiday." SATURDAY holidays are NOT shifted. Both the Sunday
 *      and its Monday are holidays; only the Monday matters for business-day counting.
 *   2. Once-off holidays are PROCLAIMED BY THE PRESIDENT under s2A, usually with months of notice
 *      (national elections have done this). A proclaimed day missing from this table is the same
 *      fail-open in miniature: cure period one day short, notice served one day early.
 *
 *   Source of truth: the Act's Schedule 1 + Government Gazette proclamations.
 *   Review prompt: the horizon sentinel in lib/observability/health.ts nags from 90 days out. When it
 *   fires, extend the table AND re-check for new proclamations — the nag is both, not just the extension.
 *
 * Notes:  All arithmetic is UTC-anchored on YYYY-MM-DD strings. Never use getDay()/setDate() here —
 *         those are LOCAL-time accessors, so they mean UTC on Vercel and SAST on a dev machine, and the
 *         previous implementation mixed the two inside one function (local getDay() + UTC toISOString()).
 *
 *         Past the horizon, the statutory path THROWS (a forgotten table update must be a loud outage,
 *         never a silently shortened cure period) while the advisory path warns and degrades — see each.
 */

// Base holidays are listed with their OBSERVED dates. A comment naming a Monday must be justified either
// by (a) the base holiday genuinely falling on a Monday, or (b) s2(1) shifting a SUNDAY holiday onto it.
// The test file asserts exactly that, so a hand-edit that violates the Act fails CI.

export const SA_PUBLIC_HOLIDAYS_2025 = [
  "2025-01-01", // New Year's Day (Wed)
  "2025-03-21", // Human Rights Day (Fri)
  "2025-04-18", // Good Friday
  "2025-04-21", // Family Day (Easter Monday)
  "2025-04-27", // Freedom Day (Sun)
  "2025-04-28", // s2(1) observed Monday for Freedom Day
  "2025-05-01", // Workers' Day (Thu)
  "2025-06-16", // Youth Day (Mon)
  "2025-08-09", // National Women's Day (Sat — the Act does NOT shift Saturdays)
  "2025-09-24", // Heritage Day (Wed)
  "2025-12-16", // Day of Reconciliation (Tue)
  "2025-12-25", // Christmas Day (Thu)
  "2025-12-26", // Day of Goodwill (Fri)
]

export const SA_PUBLIC_HOLIDAYS_2026 = [
  "2026-01-01", // New Year's Day (Thu)
  "2026-03-21", // Human Rights Day (Sat — NOT shifted; the removed "2026-03-23" was spurious)
  "2026-04-03", // Good Friday
  "2026-04-06", // Family Day (Easter Monday)
  "2026-04-27", // Freedom Day (Mon — falls on a Monday naturally)
  "2026-05-01", // Workers' Day (Fri)
  "2026-06-16", // Youth Day (Tue)
  "2026-08-09", // National Women's Day (Sun)
  "2026-08-10", // s2(1) observed Monday for National Women's Day
  "2026-09-24", // Heritage Day (Thu)
  "2026-12-16", // Day of Reconciliation (Wed)
  "2026-12-25", // Christmas Day (Fri)
  "2026-12-26", // Day of Goodwill (Sat — NOT shifted)
]

export const SA_PUBLIC_HOLIDAYS_2027 = [
  "2027-01-01", // New Year's Day (Fri)
  "2027-03-21", // Human Rights Day (Sun)
  "2027-03-22", // s2(1) observed Monday for Human Rights Day — WAS MISSING (cure period ran a day short)
  "2027-03-26", // Good Friday
  "2027-03-29", // Family Day (Easter Monday)
  "2027-04-27", // Freedom Day (Tue)
  "2027-05-01", // Workers' Day (Sat — NOT shifted; the removed "2027-05-03" was spurious)
  "2027-06-16", // Youth Day (Wed)
  "2027-08-09", // National Women's Day (Mon — falls on a Monday naturally)
  "2027-09-24", // Heritage Day (Fri)
  "2027-12-16", // Day of Reconciliation (Thu)
  "2027-12-25", // Christmas Day (Sat — NOT shifted)
  "2027-12-26", // Day of Goodwill (Sun)
  "2027-12-27", // s2(1) observed Monday for DAY OF GOODWILL (not Christmas — Christmas is a Saturday)
]

/** The first day this table can answer for. Below it, holidays are unknown, not absent. */
export const HOLIDAY_TABLE_COVERS_FROM = "2025-01-01"
/** The last day this table can answer for. Past it, holidays are unknown, not absent. */
export const HOLIDAY_TABLE_COVERS_THROUGH = "2027-12-31"

const ALL_HOLIDAYS = new Set([
  ...SA_PUBLIC_HOLIDAYS_2025,
  ...SA_PUBLIC_HOLIDAYS_2026,
  ...SA_PUBLIC_HOLIDAYS_2027,
])

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
      `Extend SA_PUBLIC_HOLIDAYS_* in lib/dates/saPublicHolidays.ts and check the Government Gazette for ` +
      `newly proclaimed once-off holidays. Refusing to compute a statutory deadline against unknown holidays.`,
  )
}

/** UTC day-of-week. NEVER getDay() — that is local time, which differs between Vercel and a dev machine. */
function isBusinessDayISO(dateStr: string): boolean {
  const dow = new Date(`${dateStr}T00:00:00.000Z`).getUTCDay()
  if (dow === 0 || dow === 6) return false
  return !isPublicHoliday(dateStr)
}

function shiftISO(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
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
  if (!Number.isInteger(n) || n < 0) {
    throw new TypeError(`addBusinessDays: n must be a non-negative whole number, got ${n}.`)
  }
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
 * ADVISORY (calendar reminders), not a gate. Subtract `n` business days from an instant.
 *
 * Deliberately does NOT throw past the horizon: it is called with lease end dates that legitimately sit
 * years out, and a thrown error would blank the agent's calendar rather than protect anyone. Its failure
 * mode is a reminder one day off, not an unlawful notice. It warns instead, and the horizon sentinel in
 * health.ts is what actually keeps the table current.
 */
export function subtractBusinessDays(date: Date, days: number): Date {
  let cursor = date.toISOString().slice(0, 10)
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
  return new Date(`${cursor}T00:00:00.000Z`)
}
