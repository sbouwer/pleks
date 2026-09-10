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
import { BASIS_PROCLAMATION, SA_PUBLIC_HOLIDAYS, type HolidayEntry } from "./saPublicHolidays"

/** A holiday as a witness API reports it — just a date and a name. */
export interface ApiHoliday {
  date: string
  name: string
}

export type DiffClass =
  | "A" // API has a date the table lacks — a possible s2A proclamation we have not carried. ALERT.
  | "B" // table has a date the API lacks — a possible table error OR an API gap. ALERT; the table wins pending review.
  | "C" // dates agree and only name/metadata differs, OR a gazetted s2A date no feed carries. INFO.

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
    if (apiByDate.has(date)) continue

    // ⚠ An s2A proclamation MISSING from an aggregator is the EXPECTED state, not a finding. Alerting here
    // would be the auditor reporting a disagreement from a witness that structurally cannot testify — the
    // one thing this subsystem refuses to do everywhere else ("a checker that cannot see must never look
    // identical to a checker that saw nothing", holidayAuditFetch.ts).
    //
    // The evidence is this module's own sibling measurement: of three known s2A proclamations, Nager carried
    // ONE (2023-12-15) and missed both municipal-election holidays — 2016-08-03 and 2021-11-01 — PERMANENTLY,
    // not with a lag. So a CORRECT s2A row alerts every day, forever, and a digest that always fails is a
    // digest nobody reads. Measured 2026-09-10 on the table's first-ever s2A entry: adding 2026-11-04 turned
    // a self-clearing gazette alert into a permanent one, which is how this path came to be exercised at all.
    //
    // What actually vouches for an s2A row is Rule 5 in saPublicHolidays.ts — a Government Gazette source,
    // required and enforced at module load — not a feed that never saw the proclamation. Keyed on `basis`
    // alone rather than `basis && source`, because Rule 5 already makes the source non-empty before this
    // code can run; re-testing it here would read as though it might be false.
    //
    // Still REPORTED, as INFO: "we deliberately carry a weekday date no feed confirms" is worth seeing.
    if (entry.basis === BASIS_PROCLAMATION) {
      diffs.push({ date, cls: "C", detail: `${date}: table has "${entry.name}" (${entry.basis}) and no feed carries it — expected for a gazetted proclamation, which aggregators routinely miss. Vouched by its Gazette source, not by the feeds.` })
      continue
    }

    diffs.push({ date, cls: "B", detail: `table has "${entry.name}" (${entry.basis}) on ${date}; the API does not. The table wins pending review (feeds have missed SA observed-Mondays), but confirm it is not a table error.` })
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

/** One item from the gov.za notices feed — the OFFICIAL publisher, not an aggregator. */
export interface GazetteNotice {
  title: string
  link: string
  /** RFC-822 string exactly as the feed gave it; never re-parsed into a holiday date. See below. */
  pubDate: string
}

/**
 * Does this gazette-notice title announce a public holiday?
 *
 * THE MATCH IS DELIBERATELY BROAD, and the asymmetry is the whole argument: a false positive costs one
 * email that a human dismisses in five seconds; a false negative costs a statutory notice served a day
 * early, which is void. So this matches any notice title mentioning a public holiday rather than trying to
 * be clever about the exact form.
 *
 * The real titles it must catch (verified against gov.za/documents/notices on 2026-09-09):
 *   "Public Holidays Act: Declaration of 29 May 2024 as public holiday"
 *   "Public Holidays Act: Declaration of 15th day of December 2023 as public holiday"
 *   "Public Holidays Act: Declaration of 1 November 2021 as a public holiday"
 *   "Public Holidays Act: Declaration of the Twenty-Seventh Day of December 2022 as a public holiday"
 *   "Public Holidays Act: Declaration of 31 December 1999 and 2 January 2000 as public holidays"
 *
 * ⚠ NOTHING HERE PARSES A DATE OUT OF THE TITLE, and that is a decision, not an omission. Look at the five
 * forms above: bare ("29 May 2024"), ordinal-word ("Twenty-Seventh Day of"), ordinal-digit ("15th day of"),
 * year-less ("18 May"), and TWO dates in one notice. A parser over that set does not fail loudly — it
 * returns a confident wrong date, and a confident wrong holiday is worse than no holiday, because the
 * business-day arithmetic downstream cannot tell it was guessed. The notice and its link go to a human,
 * who reads the proclamation and adds the entry with its Gazette reference. Skeptic, never authority (D-7d).
 */
export function isProclamationNotice(title: string): boolean {
  return /public\s+holiday/i.test(title)
}

/**
 * Parse gov.za's RSS into notices — string-scanning, no XML dependency.
 *
 * PURE and exported so the parse is fixture-testable. It lives here rather than beside the fetcher because
 * the parse is where a silent regression hides: gov.za is a Drupal site whose feed shape is not a contract,
 * and a parse that quietly yields nothing is indistinguishable from a quiet week. The caller treats an empty
 * result as "could not look", never as "no proclamations" — that is the only reason this may stay this simple.
 *
 * Each item's `<description>` carries the whole notice as entity-encoded HTML (verified against the live
 * feed 2026-09-09), which is why the scan is per-tag and per-item rather than a global regex over the body:
 * `&lt;a href&gt;` inside a description must never be mistaken for markup of the feed itself.
 */
export function parseGazetteNotices(xml: string): GazetteNotice[] {
  const notices: GazetteNotice[] = []
  // .slice(1) drops everything before the first <item> — the channel's own <title>/<link>.
  for (const chunk of xml.split("<item>").slice(1)) {
    const itemXml = chunk.split("</item>")[0]
    const title = tagText(itemXml, "title")
    if (!title) continue
    notices.push({ title, link: tagText(itemXml, "link") ?? "", pubDate: tagText(itemXml, "pubDate") ?? "" })
  }
  return notices
}

/** Pull one tag's text out of an RSS <item>, tolerating CDATA and entity-encoding. */
function tagText(itemXml: string, tag: string): string | null {
  const open = `<${tag}>`
  const close = `</${tag}>`
  const start = itemXml.indexOf(open)
  if (start === -1) return null
  const end = itemXml.indexOf(close, start + open.length)
  if (end === -1) return null
  let raw = itemXml.slice(start + open.length, end).trim()
  if (raw.startsWith("<![CDATA[") && raw.endsWith("]]>")) raw = raw.slice(9, -3)
  return decodeEntities(raw).trim()
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'").replace(/&apos;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")   // last, so "&amp;lt;" does not become "<"
}

/** Convenience for the cron/script: diff the LIVE bundled table against an API set. */
export function auditLiveTable(apiEntries: readonly ApiHoliday[], coversFrom: string, coversThrough: string): HolidayAuditResult {
  return classifyHolidayDiff(SA_PUBLIC_HOLIDAYS, apiEntries, coversFrom, coversThrough)
}
