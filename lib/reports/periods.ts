import { ReportPeriodType } from "./types"

// SA tax year: 1 March → 28/29 February
function saTaxYearStart(year: number): Date {
  return new Date(year, 2, 1) // March 1
}

function saTaxYearEnd(year: number): Date {
  return new Date(year + 1, 1, 28) // Feb 28 (simplified — handles leap year close enough for reporting)
}

export function resolvePeriod(
  periodType: ReportPeriodType,
  customFrom?: Date,
  customTo?: Date
): { from: Date; to: Date } {
  const now = new Date()
  const y = now.getFullYear()
  const m = now.getMonth()

  switch (periodType) {
    case "this_month":
      return { from: new Date(y, m, 1), to: new Date(y, m + 1, 0) }
    case "last_month":
      return { from: new Date(y, m - 1, 1), to: new Date(y, m, 0) }
    case "this_quarter": {
      const qStart = Math.floor(m / 3) * 3
      return { from: new Date(y, qStart, 1), to: new Date(y, qStart + 3, 0) }
    }
    case "last_quarter": {
      const qStart = Math.floor(m / 3) * 3 - 3
      return { from: new Date(y, qStart, 1), to: new Date(y, qStart + 3, 0) }
    }
    case "this_tax_year": {
      // If before March, tax year started previous year
      const taxStart = m < 2 ? saTaxYearStart(y - 1) : saTaxYearStart(y)
      const taxEnd = m < 2 ? saTaxYearEnd(y - 1) : saTaxYearEnd(y)
      return { from: taxStart, to: taxEnd }
    }
    case "last_tax_year": {
      const taxStart = m < 2 ? saTaxYearStart(y - 2) : saTaxYearStart(y - 1)
      const taxEnd = m < 2 ? saTaxYearEnd(y - 2) : saTaxYearEnd(y - 1)
      return { from: taxStart, to: taxEnd }
    }
    case "custom":
      if (!customFrom || !customTo) throw new Error("Custom period requires from and to dates")
      return { from: customFrom, to: customTo }
    default:
      return { from: new Date(y, m, 1), to: new Date(y, m + 1, 0) }
  }
}

export function formatPeriodLabel(from: Date, to: Date): string {
  const opts: Intl.DateTimeFormatOptions = { month: "long", year: "numeric" }
  const fromStr = from.toLocaleDateString("en-ZA", opts)
  const toStr = to.toLocaleDateString("en-ZA", opts)
  if (fromStr === toStr) return fromStr
  return `${fromStr} — ${toStr}`
}

export function formatDateShort(d: Date): string {
  return d.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" })
}

/**
 * Format a Date as YYYY-MM-DD using local time (not UTC).
 * Use this for all SQL date column comparisons — toISOString() shifts
 * dates by the server timezone offset, causing off-by-one errors.
 */
export function toDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${day}`
}
