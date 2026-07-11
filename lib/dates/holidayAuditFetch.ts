/**
 * lib/dates/holidayAuditFetch.ts — the auditor's HANDS: fetch witness holidays, run the diff
 *
 * SERVER/SCRIPT ONLY. Deliberately NOT re-exported from lib/dates/index — it pulls `fetch` and a network
 * dependency that must never reach a client bundle. The script (scripts/audit-holiday-table.mts) and the
 * sentinel cron (app/api/cron/holiday-sentinel) both import it directly.
 *
 * Transport hardening ported from yoros-crm fetch_holidays.py (retry/backoff, the 401/429 latch, the
 * Calendarific date-shape tolerance) — but the ROLE is inverted: it fetches to DIFF, never to write.
 */
import { HOLIDAY_TABLE_COVERS_FROM, HOLIDAY_TABLE_COVERS_THROUGH } from "./saPublicHolidays"
import { auditLiveTable, witnessDisagreement, type ApiHoliday, type HolidayAuditResult } from "./holidayAudit"
import { optionalEnv } from "@/lib/env"

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

function yearsInWindow(): number[] {
  const from = Number(HOLIDAY_TABLE_COVERS_FROM.slice(0, 4))
  const through = Number(HOLIDAY_TABLE_COVERS_THROUGH.slice(0, 4))
  return Array.from({ length: through - from + 1 }, (_, i) => from + i)
}

/** Nager.Date — primary witness, no key needed. Returns null on any failure (unreachable ≠ empty). */
export async function fetchNagerZA(): Promise<ApiHoliday[] | null> {
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

/** Calendarific — second witness, key optional. Absent key ⇒ null (skipped, not a failure). */
export async function fetchCalendarificZA(): Promise<ApiHoliday[] | null> {
  const key = optionalEnv("CALENDARIFIC_API_KEY")
  if (!key) return null
  const out: ApiHoliday[] = []
  for (const year of yearsInWindow()) {
    const { status, body } = await getJson(`https://calendarific.com/api/v2/holidays?api_key=${key}&country=ZA&year=${year}`)
    if (status === 401 || status === 429) return null   // quota/auth — drop the witness, don't fabricate diffs
    if (status !== 200 || typeof body !== "object" || body === null) return null
    const holidays = ((body as { response?: { holidays?: unknown } }).response?.holidays) ?? []
    if (!Array.isArray(holidays)) return null
    for (const h of holidays as Array<Record<string, unknown>>) {
      const rawDate = h.date
      const iso = typeof rawDate === "object" && rawDate !== null ? (rawDate as { iso?: string }).iso : (rawDate as string | undefined)
      const date = typeof iso === "string" ? iso.slice(0, 10) : undefined
      const name = h.name
      if (typeof date === "string" && DATE_RX.test(date) && typeof name === "string") out.push({ date, name })
    }
  }
  return out
}

export interface HolidayAuditReport {
  ran: boolean
  nagerReachable: boolean
  calendarificReachable: boolean
  primary: HolidayAuditResult | null
  witnessDisagreementDates: string[]
  /** True if anything needs a human: a Class-A/B diff, or the two witnesses disagreeing. */
  needsReview: boolean
}

/**
 * Run the full audit against the live bundled table. Nager is the primary witness; Calendarific, if its key
 * is set, is a second witness whose disagreement with Nager escalates to review even where the table matches
 * one of them. If Nager is unreachable the audit reports `ran:false` (the auditor going dark is itself the
 * signal — the C-1 lesson — but it is NEVER treated as "no findings").
 */
export async function runHolidayAudit(): Promise<HolidayAuditReport> {
  const [nager, calendarific] = await Promise.all([fetchNagerZA(), fetchCalendarificZA()])

  if (!nager) {
    return { ran: false, nagerReachable: false, calendarificReachable: !!calendarific, primary: null, witnessDisagreementDates: [], needsReview: false }
  }

  const primary = auditLiveTable(nager, HOLIDAY_TABLE_COVERS_FROM, HOLIDAY_TABLE_COVERS_THROUGH)
  const witnessDisagreementDates = calendarific
    ? witnessDisagreement(nager, calendarific, HOLIDAY_TABLE_COVERS_FROM, HOLIDAY_TABLE_COVERS_THROUGH)
    : []

  return {
    ran: true,
    nagerReachable: true,
    calendarificReachable: !!calendarific,
    primary,
    witnessDisagreementDates,
    needsReview: primary.hasAlerts || witnessDisagreementDates.length > 0,
  }
}
