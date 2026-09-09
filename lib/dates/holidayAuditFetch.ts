/**
 * lib/dates/holidayAuditFetch.ts — the auditor's HANDS: fetch witness holidays, run the diff
 *
 * SERVER/SCRIPT ONLY. Deliberately NOT re-exported from lib/dates/index — it pulls `fetch` and a network
 * dependency that must never reach a client bundle. The script (scripts/audit-holiday-table.mts) and the
 * sentinel cron (app/api/cron/holiday-sentinel) both import it directly.
 *
 * Transport hardening (retry/backoff, hard timeout) came from the yoros-crm fetch_holidays.py lineage — but
 * the ROLE is inverted: it fetches to DIFF, never to write.
 *
 * TWO WITNESSES, DIFFERENT KINDS: Nager.Date gives a date SET to diff; gov.za's RSS gives gazette NOTICES to
 * pattern-match. Calendarific was removed 2026-09-09 — its key was never set anywhere, so it had always
 * returned null. See runHolidayAudit below for why an inert control is worse than an absent one.
 */
import { HOLIDAY_TABLE_COVERS_FROM, HOLIDAY_TABLE_COVERS_THROUGH } from "./saPublicHolidays"
import { auditLiveTable, isProclamationNotice, parseGazetteNotices, type ApiHoliday, type GazetteNotice, type HolidayAuditResult } from "./holidayAudit"

const DATE_RX = /^\d{4}-\d{2}-\d{2}$/
const HTTP_TIMEOUT_MS = 8000
const MAX_RETRIES = 2
const RETRY_BACKOFF_MS = 600

async function getJson(url: string): Promise<{ status: number; body: unknown }> {
  let delay = 0
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (delay) await new Promise((r) => setTimeout(r, delay))
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), HTTP_TIMEOUT_MS)
      const res = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "Pleks-HolidayAuditor/1.0" } })
      clearTimeout(t)
      if (res.status === 200) return { status: 200, body: await res.json().catch(() => null) }
      return { status: res.status, body: null }
    } catch {
      if (attempt === MAX_RETRIES) return { status: 0, body: null }
    }
    delay = RETRY_BACKOFF_MS * 2 ** attempt
  }
  return { status: 0, body: null }
}

/** Same transport as getJson, but for the RSS feed — the body is XML, not JSON. */
async function getText(url: string): Promise<{ status: number; body: string | null }> {
  let delay = 0
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (delay) await new Promise((r) => setTimeout(r, delay))
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), HTTP_TIMEOUT_MS)
      const res = await fetch(url, { signal: ctrl.signal, headers: { "User-Agent": "Pleks-HolidayAuditor/1.0" } })
      clearTimeout(t)
      if (res.status === 200) return { status: 200, body: await res.text().catch(() => null) }
      return { status: res.status, body: null }
    } catch {
      if (attempt === MAX_RETRIES) return { status: 0, body: null }
    }
    delay = RETRY_BACKOFF_MS * 2 ** attempt
  }
  return { status: 0, body: null }
}

function yearsInWindow(): number[] {
  const from = Number(HOLIDAY_TABLE_COVERS_FROM.slice(0, 4))
  const through = Number(HOLIDAY_TABLE_COVERS_THROUGH.slice(0, 4))
  return Array.from({ length: through - from + 1 }, (_, i) => from + i)
}

/** Nager.Date — primary witness, no key needed. Returns null on any failure (unreachable ≠ empty). */
async function fetchNagerZA(): Promise<ApiHoliday[] | null> {
  const out: ApiHoliday[] = []
  for (const year of yearsInWindow()) {
    const { status, body } = await getJson(`https://date.nager.at/api/v3/PublicHolidays/${year}/ZA`)
    if (status !== 200 || !Array.isArray(body)) return null   // a partial fetch would fabricate Class-B noise
    for (const item of body as Array<Record<string, unknown>>) {
      const date = item.date
      const name = (item.localName ?? item.name) as string | undefined
      if (typeof date === "string" && DATE_RX.test(date) && typeof name === "string") out.push({ date, name })
    }
  }
  return out
}

/**
 * How long the gov.za feed must be able to look back to be trustworthy on this cron's cadence.
 *
 * The feed returns a FIXED TEN ITEMS — a count cap, not a time window — and gazette publication is bursty
 * (measured 2026-09-09: 10 items spanning Fri 04 → Tue 08 Sep). On a heavy publication day ten notices can
 * represent a few hours, so a slower poll than the churn silently drops everything in between. We cannot
 * see what rolled off, so instead we detect the CONDITION: if even the oldest item is younger than one
 * polling interval, the window did not cover the gap and the run must say so rather than report clean.
 * That is the same rule the rest of this subsystem runs on — a checker that cannot see must never look
 * identical to a checker that saw nothing.
 */
const GOVZA_POLL_INTERVAL_MS = 24 * 60 * 60 * 1000   // the sentinel's cPanel cadence (.claude/rules/crons.md)

export interface GovZaNoticeReport {
  /** Notices whose titles announce a public holiday. Usually empty; that is the point. */
  proclamations: GazetteNotice[]
  /** The ten-item window did not reach back a full polling interval — notices may have rolled off unseen. */
  windowOverrun: boolean
  itemsSeen: number
  oldestItem: string | null
}

/**
 * gov.za's official notices feed — the PUBLISHER, not an aggregator.
 *
 * This is the witness that closes the gap Nager leaves. Measured 2026-09-09 against three known s2A
 * proclamations, Nager carried ONE (2023-12-15 "Springboks Victory") and missed the two municipal-election
 * holidays (2016-08-03, 2021-11-01) — permanently, not with a lag. gov.za carries all of them, because it
 * is where they are published.
 *
 * It fires at GAZETTING, not at announcement: a holiday declared by the Presidency but not yet gazetted is
 * invisible here, correctly — gazetting is the legally operative moment. Returns null on any failure, which
 * the caller reports as "could not look", never as "nothing found".
 */
async function fetchGovZaNotices(nowMs: number): Promise<GovZaNoticeReport | null> {
  const { status, body } = await getText("https://www.gov.za/rss.xml")
  if (status !== 200 || !body) return null

  const notices = parseGazetteNotices(body)
  if (notices.length === 0) return null   // a feed that parsed to nothing is a broken parse, not a quiet day
  const proclamations = notices.filter((n) => isProclamationNotice(n.title))

  const times = notices
    .map((n) => Date.parse(n.pubDate))
    .filter((t) => Number.isFinite(t))
  const oldestMs = times.length ? Math.min(...times) : null

  return {
    proclamations,
    // Unparseable dates ⇒ treat as overrun: we cannot prove the window was deep enough, and this check
    // exists precisely to refuse to assume that.
    windowOverrun: oldestMs === null || oldestMs > nowMs - GOVZA_POLL_INTERVAL_MS,
    itemsSeen: notices.length,
    oldestItem: oldestMs === null ? null : new Date(oldestMs).toISOString(),
  }
}

export interface HolidayAuditReport {
  ran: boolean
  nagerReachable: boolean
  primary: HolidayAuditResult | null
  /** null ⇒ gov.za could not be read this run. NOT the same as "no proclamations". */
  govZa: GovZaNoticeReport | null
  /** True if anything needs a human: a Class-A/B diff, a proclamation notice, or an unprovable feed window. */
  needsReview: boolean
}

/**
 * Run the full audit against the live bundled table.
 *
 * TWO WITNESSES OF DIFFERENT KINDS, and the distinction matters more than their number:
 *   • Nager.Date  — a DATE SET, diffed against the table (Class A/B/C).
 *   • gov.za RSS  — NOTICES, matched by title. There is nothing to diff: it is the publisher announcing a
 *     proclamation, so its finding is "go read this", not "these dates disagree".
 * They do not share an interface and are deliberately not forced into one.
 *
 * Calendarific was REMOVED on 2026-09-09. It had been a second date-set witness behind an optional API key
 * — and the key was never set in any environment, so `fetchCalendarificZA` returned null on every run this
 * code has ever made, `witnessDisagreement` was called zero times, and the audit reported a two-witness
 * design while doing single-witness work. A control that is present, documented and inert is worse than an
 * absent one: it is counted as coverage by everyone reading the file. Rebuilding it is a matter of adding
 * back a fetcher and a set-difference, and should only be done with a key in hand.
 *
 * If Nager is unreachable the audit reports `ran:false` (the auditor going dark is itself the signal — the
 * C-1 lesson — but it is NEVER treated as "no findings").
 */
export async function runHolidayAudit(nowMs: number = Date.now()): Promise<HolidayAuditReport> {
  const [nager, govZa] = await Promise.all([fetchNagerZA(), fetchGovZaNotices(nowMs)])

  if (!nager) {
    return { ran: false, nagerReachable: false, primary: null, govZa, needsReview: !!govZa?.proclamations.length }
  }

  const primary = auditLiveTable(nager, HOLIDAY_TABLE_COVERS_FROM, HOLIDAY_TABLE_COVERS_THROUGH)

  return {
    ran: true,
    nagerReachable: true,
    primary,
    govZa,
    needsReview: primary.hasAlerts || !!govZa?.proclamations.length || !!govZa?.windowOverrun,
  }
}
