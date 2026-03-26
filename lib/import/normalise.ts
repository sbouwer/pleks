const ISO_DATE_RE = /^(\d{4})-(\d{1,2})-(\d{1,2})$/
const DMY_DATE_RE = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/
const CURRENCY_STRIP_RE = /[R\s,]/g

/**
 * Normalise a date string from various formats to YYYY-MM-DD.
 * Handles: DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD
 */
export function normaliseDate(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  // YYYY-MM-DD (already ISO)
  const isoMatch = ISO_DATE_RE.exec(trimmed)
  if (isoMatch) {
    const year = isoMatch[1]
    const month = isoMatch[2]?.padStart(2, "0")
    const day = isoMatch[3]?.padStart(2, "0")
    const date = new Date(`${year}-${month}-${day}`)
    if (Number.isNaN(date.getTime())) return null
    return `${year}-${month}-${day}`
  }

  // DD/MM/YYYY or DD-MM-YYYY
  const dmyMatch = DMY_DATE_RE.exec(trimmed)
  if (dmyMatch) {
    const day = dmyMatch[1]?.padStart(2, "0")
    const month = dmyMatch[2]?.padStart(2, "0")
    const year = dmyMatch[3]
    const date = new Date(`${year}-${month}-${day}`)
    if (Number.isNaN(date.getTime())) return null
    return `${year}-${month}-${day}`
  }

  return null
}

/**
 * Normalise a currency string to cents (integer).
 * Strips R prefix, spaces, commas. Multiplies rands by 100.
 * e.g. "R 6,600.00" → 660000, "5000" → 500000
 */
export function normaliseCurrencyCents(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  // Strip R, spaces, commas
  const cleaned = trimmed.replaceAll(CURRENCY_STRIP_RE, "")
  if (!cleaned) return null

  const value = Number.parseFloat(cleaned)
  if (Number.isNaN(value)) return null

  return Math.round(value * 100)
}
