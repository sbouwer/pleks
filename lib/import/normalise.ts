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
