/**
 * lib/dates/holidayAudit.ts — the AUDITOR's brain: diff our table against a public-holiday API
 *
 * Notes:  Ported in spirit from yoros-crm's fetch_holidays.py, but ROLE-INVERTED (ADDENDUM_70K D-7d): that
 *         script fetched and WROTE; this one diffs and NEVER writes. An API is an auditor, never an
 *         authority — SA's observed-Monday handling has been wrong in public feeds before, which is exactly
 *         why the table wins a disagreement pending human review. *Their fetcher is a populator; ours is a
 *         skeptic.*
 *
 *         This module is PURE (no network, no fs, no process.env) so the classification is unit-testable
 *         with fixtures. The fetching + CLI live in scripts/audit-holiday-table.mts; the cron path is
 *         app/api/cron/holiday-sentinel. All three share `classifyHolidayDiff`.
 */
import { SA_PUBLIC_HOLIDAYS, type HolidayEntry } from "./saPublicHolidays"

/** A holiday as a witness API reports it — just a date and a name. */
export interface ApiHoliday {
  date: string
  name: string
}

export type DiffClass =
  | "A" // API has a date the table lacks — a possible s2A proclamation we have not carried. ALERT.
  | "B" // table has a date the API lacks — a possible table error OR an API gap. ALERT; the table wins pending review.
  | "C" // dates agree, only name/metadata differs. INFO.

export interface HolidayDiff {
  date: string
  cls: DiffClass
  detail: string
}

export interface HolidayAuditResult {
  /** Only dates INSIDE our coverage window are compared — the API knows years we deliberately do not carry. */
  comparedFrom: string
  comparedThrough: string
  diffs: HolidayDiff[]
  /** A/B are actionable (a real disagreement); C is informational. */
  hasAlerts: boolean
}

/**
 * Classify the difference between our table and an API's ZA holidays, restricted to our coverage window.
 *
 * Pure: give it the entries, it gives you the diff. Dates the API reports OUTSIDE our window are ignored —
 * the API knowing about 2030 is not a finding when we deliberately only assert through the horizon.
 */
export function classifyHolidayDiff(
  tableEntries: readonly HolidayEntry[],
  apiEntries: readonly ApiHoliday[],
  coversFrom: string,
  coversThrough: string,
): HolidayAuditResult {
  // Only WEEKDAY dates are compared. The auditor exists to catch a discrepancy that would make a statutory
  // BUSINESS-DAY computation wrong — and a holiday on a Saturday or Sunday is never a business day, so its
  // presence or absence changes no calculation. This is not a convenience filter: without it every s2(1)
  // Sunday→Monday pair is permanent Class-B noise, because the public feeds list only the OBSERVED Monday
  // while our table (correctly) carries both the Sunday holiday and its Monday observance. The Monday is the
  // business-day-relevant date and it IS compared; the Sunday is immaterial.
  const relevant = (d: string) => d >= coversFrom && d <= coversThrough && isWeekday(d)

  const tableByDate = new Map(tableEntries.filter((h) => relevant(h.date)).map((h) => [h.date, h]))
  const apiByDate = new Map<string, ApiHoliday>()
  for (const h of apiEntries) {
    if (relevant(h.date)) apiByDate.set(h.date, h)   // last-writer-wins on a dupe date; the date is what matters
  }

  const diffs: HolidayDiff[] = []

  // Class A — API has, table lacks.
  for (const [date, api] of apiByDate) {
    if (!tableByDate.has(date)) {
      diffs.push({ date, cls: "A", detail: `API reports "${api.name}" on ${date}; the table has no entry. Possible s2A proclamation — verify against the Gazette, then add with a source.` })
    }
  }

  // Class B — table has, API lacks. The table wins pending review.
  for (const [date, entry] of tableByDate) {
    if (!apiByDate.has(date)) {
      diffs.push({ date, cls: "B", detail: `table has "${entry.name}" (${entry.basis}) on ${date}; the API does not. The table wins pending review (feeds have missed SA observed-Mondays), but confirm it is not a table error.` })
    }
  }

  // Class C — dates agree, names differ. Informational only.
  for (const [date, entry] of tableByDate) {
    const api = apiByDate.get(date)
    if (api && normaliseName(api.name) !== normaliseName(entry.name)) {
      diffs.push({ date, cls: "C", detail: `${date}: table "${entry.name}" vs API "${api.name}" (metadata only; dates agree).` })
    }
  }

  diffs.sort((a, b) => a.date.localeCompare(b.date) || a.cls.localeCompare(b.cls))
  return {
    comparedFrom: coversFrom,
    comparedThrough: coversThrough,
    diffs,
    hasAlerts: diffs.some((d) => d.cls === "A" || d.cls === "B"),
  }
}

/** Loose name comparison — "Day of Goodwill" vs "Day of Goodwill (obs)" is not a finding. */
function normaliseName(name: string): string {
  // Drop any parenthetical suffix ("(obs)", "(observed)") first — no regex, so no backtracking — then keep
  // only letters, so "Day of Goodwill (obs)" and "Day of Goodwill" compare equal.
  return name.split("(")[0].toLowerCase().replace(/[^a-z]/g, "")
}

/** Mon–Fri, UTC-anchored (never getDay()). A weekend holiday is not a business day, so not the auditor's concern. */
function isWeekday(dateStr: string): boolean {
  const dow = new Date(`${dateStr}T00:00:00.000Z`).getUTCDay()
  return dow !== 0 && dow !== 6
}

/**
 * Two witnesses disagreeing with EACH OTHER is itself an escalation (C→A): if Nager and Calendarific do not
 * agree on the ZA set, a human must look even where our table matches one of them. Returns the dates where
 * the two witnesses differ, restricted to our window.
 */
export function witnessDisagreement(a: readonly ApiHoliday[], b: readonly ApiHoliday[], coversFrom: string, coversThrough: string): string[] {
  const relevant = (d: string) => d >= coversFrom && d <= coversThrough && isWeekday(d)
  const setA = new Set(a.filter((h) => relevant(h.date)).map((h) => h.date))
  const setB = new Set(b.filter((h) => relevant(h.date)).map((h) => h.date))
  const out = new Set<string>()
  for (const d of setA) if (!setB.has(d)) out.add(d)
  for (const d of setB) if (!setA.has(d)) out.add(d)
  return [...out].sort((x, y) => x.localeCompare(y))
}

/** Convenience for the cron/script: diff the LIVE bundled table against an API set. */
export function auditLiveTable(apiEntries: readonly ApiHoliday[], coversFrom: string, coversThrough: string): HolidayAuditResult {
  return classifyHolidayDiff(SA_PUBLIC_HOLIDAYS, apiEntries, coversFrom, coversThrough)
}

/** Re-exported so callers need one import. */
export { isWithinHolidayHorizon } from "./saPublicHolidays"
