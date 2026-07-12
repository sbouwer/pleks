/**
 * lib/import/normalise.ts — normalise import date strings to ISO (YYYY-MM-DD) and currency strings to cents
 *
 * Notes:  Dates accept DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD and are validated as REAL calendar days via the
 *         `isSaDateISO` boundary guard (so "2026-11-31" is rejected at the parse layer, not silently rolled
 *         to Dec 1 by V8 and bounced by Postgres later). Currency is LOCALE-AWARE: both en-ZA ("6,600.50",
 *         comma thousands / dot decimal) and af-ZA ("6 600,50", space thousands / comma decimal) are real SA
 *         upload shapes, so the parser resolves the decimal separator from position rather than stripping
 *         commas blind — the old code turned "6600,50" into R660,050.00, a silent 100× error straight into
 *         rent, deposit and the trust ledger. When the format is genuinely ambiguous it returns null (flag to
 *         the agent) rather than guess. Everything returns null on anything it cannot confidently parse.
 */
import { isSaDateISO } from "@/lib/dates"

const ISO_DATE_RE = /^(\d{4})-(\d{1,2})-(\d{1,2})$/
const DMY_DATE_RE = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/

/**
 * Normalise a date string (DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD) to YYYY-MM-DD, or null if it is not a
 * well-formed REAL calendar day. Real-day validation is `isSaDateISO` (rejects month 13, Feb 30, Nov 31) —
 * fail-closed at the parse boundary, so an unreal imported date surfaces as a row-level "invalid date"
 * instead of a confusing whole-batch Postgres rejection.
 */
export function normaliseDate(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  const isoMatch = ISO_DATE_RE.exec(trimmed)
  if (isoMatch) {
    const candidate = `${isoMatch[1]}-${isoMatch[2]?.padStart(2, "0")}-${isoMatch[3]?.padStart(2, "0")}`
    return isSaDateISO(candidate) ? candidate : null
  }

  const dmyMatch = DMY_DATE_RE.exec(trimmed)
  if (dmyMatch) {
    const candidate = `${dmyMatch[3]}-${dmyMatch[2]?.padStart(2, "0")}-${dmyMatch[1]?.padStart(2, "0")}`
    return isSaDateISO(candidate) ? candidate : null
  }

  return null
}

/**
 * Normalise a currency string to integer cents, locale-aware. The currency symbol (R) and spaces (the af-ZA
 * thousands separator) are dropped, then the decimal separator is resolved from the remaining `.`/`,`:
 *   - both present  → the one that appears LAST is the decimal ("6,600.50" and "6.600,50" both → 660050)
 *   - only a comma  → decimal iff a single comma with exactly two trailing digits ("6600,50" → 660050);
 *                     a pure 3-digit grouping is thousands ("6,600" → 660000); anything else is AMBIGUOUS → null
 *   - only a dot    → a single dot is the decimal point ("6600.50" → 660050); multiple dots are AMBIGUOUS → null
 *   - neither       → whole rands ("5000" → 500000)
 * Returns null on empty, non-numeric, or ambiguous input — never a silent guess.
 */
/**
 * Resolve a separators-only-stripped numeric string ("6,600.50" / "6600,50" / "6,600" / …) to a plain
 * dot-decimal number string ("6600.50" / "6600"), or null if the `.`/`,` layout is genuinely ambiguous.
 * Input has already had the R and spaces removed and matches /^[\d.,]+$/.
 */
function toCanonicalNumber(s: string): string | null {
  const hasDot = s.includes(".")
  const hasComma = s.includes(",")

  if (hasDot && hasComma) {
    // The separator that appears LAST is the decimal; the other groups thousands.
    return s.lastIndexOf(".") > s.lastIndexOf(",")
      ? s.replaceAll(",", "")                     // "6,600.50" → "6600.50"
      : s.replaceAll(".", "").replace(",", ".")   // "6.600,50" → "6600.50"
  }
  if (hasComma) {
    if (/^\d+,\d{2}$/.test(s)) return s.replace(",", ".")            // af-ZA cents:  "6600,50" → "6600.50"
    if (/^\d{1,3}(,\d{3})+$/.test(s)) return s.replaceAll(",", "")   // thousands:    "1,234,567" → "1234567"
    return null                                                      // ambiguous → flag, never guess
  }
  if (hasDot) {
    return (s.match(/\./g) ?? []).length === 1 ? s : null            // single dot = decimal; multiple = ambiguous
  }
  return s                                                           // whole rands, no separators
}

export function normaliseCurrencyCents(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  let s = trimmed.replaceAll(/[R\s]/g, "")
  if (!s) return null
  const negative = s.startsWith("-")
  if (negative) s = s.slice(1)
  if (!/^[\d.,]+$/.test(s)) return null   // only digits + separators may remain

  const canonical = toCanonicalNumber(s)
  if (canonical === null) return null

  const value = Number.parseFloat(canonical)
  if (Number.isNaN(value)) return null
  return Math.round((negative ? -value : value) * 100)
}

// ── Cents-denominated source columns (F-8) ─────────────────────────────────────────────────────────
//
// The UNIT of a money cell is a property of the column the AGENCY exported, so it is decided by that
// column's HEADER — never by the Pleks target field's name. Pleks' own internal field is `rent_amount_cents`,
// and a Pleks-shaped re-export therefore ships a header literally named `monthly_rent_cents` holding INTEGER
// CENTS. Running that through the rands parser multiplies by 100 a second time: R6 600,00 re-imports as
// R660 000,00 straight into rent, deposit and the trust ledger. A normal agency export ships "Monthly Rent"
// in rands and must still be ×100. Both shapes are real, so the header is the only thing that can tell them
// apart.

/**
 * True when a source column's HEADER declares its values are already integer cents. Matched as a whole WORD
 * TOKEN anywhere in the header — camelCase is split first — so all of these are recognised:
 *   monthly_rent_cents · Rent (cents) · RentCents · rent_cents_amount · Rent Amount (Cents)
 * An "ends with _cents" test missed every one of the last four and 100×-inflated them.
 * "percents" stays a single token, so it does NOT match.
 */
export function isCentsDenominatedHeader(header: string): boolean {
  const tokens = new Set(
    header
      .replaceAll(/([a-z])([A-Z])/g, "$1 $2")   // RentCents → Rent Cents
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter(Boolean),
  )

  if (!tokens.has("cents") && !tokens.has("cent")) return false

  // "Rent (Rands and Cents)" is a normal accounting header for a RANDS column that merely names the unit in
  // prose. Reading it as cents divides every rent by 100 — the deflation twin, arriving through the header
  // instead of the value. A column that names rands is denominated in rands, whatever else it mentions.
  return !tokens.has("rand") && !tokens.has("rands")
}

/**
 * Parse a cell from a cents-denominated column — the value IS the cents, so there is NO ×100.
 *
 * ANY decimal point is a contradiction and returns null. Not just "660000.50" (a fraction of a cent) but,
 * critically, "6600.00": a column headed `rent_amount_cents` whose values carry Excel's default money format
 * is really RANDS, and reading it as cents divides every rent by 100. An `Number.isInteger(parseFloat(x))`
 * check accepts "6600.00" — the deflation twin of the F-8 inflation bug. Thousands separators are fine.
 */
export function normaliseCentsValue(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  let s = trimmed.replaceAll(/[R\s]/g, "")
  if (!s) return null
  const negative = s.startsWith("-")
  if (negative) s = s.slice(1)
  if (!/^[\d.,]+$/.test(s)) return null

  const canonical = toCanonicalNumber(s)
  if (canonical === null) return null
  if (canonical.includes(".")) return null   // a cents column must hold WHOLE cents — "6600.00" is rands

  const value = Number.parseInt(canonical, 10)
  if (Number.isNaN(value)) return null

  return negative ? -value : value
}

/**
 * Parse a percentage cell (escalation rate) — locale-aware, like the money parser. `Number.parseFloat("7,5")`
 * returns 7, quietly turning a 7.5% escalation into 7% and compounding it annually for the life of the lease.
 * A percentage has no thousands separator, so a single `,` or `.` is unambiguously the decimal point.
 * Returns null on anything else ("CPI", "market related") so the caller flags rather than defaults.
 */
export function normalisePercent(raw: string): number | null {
  const s = raw.trim().replaceAll("%", "").replaceAll(/\s/g, "")
  if (!s) return null

  // Leading number, tolerating a trailing annotation ("7,5% p.a."). Anchored at the START so a non-numeric
  // cell ("CPI", "market related") still returns null and is flagged rather than silently taking the default.
  const match = /^[+-]?\d+(?:[.,]\d+)?/.exec(s)
  if (!match) return null

  const value = Number.parseFloat(match[0].replace(",", "."))
  if (Number.isNaN(value)) return null

  // escalation_percent is numeric(5,2) — |value| >= 1000 overflows and Postgres rejects the whole lease with
  // a raw driver message. Flag it as an unreadable percentage instead.
  if (Math.abs(value) >= 1000) return null

  return value
}

/**
 * Normalise `leases.payment_due_day`. Migration 007 changed this column to TEXT and widened its domain to
 * "1".."28" plus "last_day" / "last_working_day"; the importer was still `parseInt`-ing it, so an agency whose
 * whole book bills on the last day of the month got NaN → column omitted → DEFAULT '1', silently moving every
 * rent due date (and every arrears computation) to the 1st. Returns null on anything outside the domain.
 */
export function normalisePaymentDueDay(raw: string): string | null {
  const s = raw.toLowerCase().trim()
  if (!s) return null

  if (/^last[\s_-]*working[\s_-]*day$/.test(s)) return "last_working_day"
  if (/^last[\s_-]*day$/.test(s)) return "last_day"

  const n = Number.parseInt(s, 10)
  if (Number.isNaN(n) || n < 1 || n > 28) return null   // 29-31 are not expressible — that is what last_day is for
  return String(n)
}

/**
 * The ONE money entry point for the import boundary. `sourceHeader` is the header as it appeared IN THE FILE
 * (the ColumnMapping key), and it — not the Pleks field name — selects the unit. Returns null on anything it
 * cannot confidently parse; the caller must surface that as a row-level review item, never write a silent null.
 */
export function normaliseMoneyCents(raw: string, sourceHeader: string): number | null {
  return isCentsDenominatedHeader(sourceHeader)
    ? normaliseCentsValue(raw)
    : normaliseCurrencyCents(raw)
}
