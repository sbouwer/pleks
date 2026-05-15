/**
 * lib/searchworx/utils.ts — Shared Searchworx parsing helpers
 *
 * Notes:  ADDENDUM_14H §4.3 + Amendment §C, §D. Five date formats observed across products;
 *         each product elides absent fields differently (Sigma omits, Deeds/CIPC use "-").
 *         Numeric coercion lives here — callers receive typed numbers, never quoted strings.
 */

// ─── Date parsing ─────────────────────────────────────────────────────────────

export function parseSearchworxDate(s: string | undefined | null): Date | null {
  if (!s || s === "-" || s.trim() === "") return null

  // 1. DD/MM/YYYY [HH:mm:ss]  —  Sigma/Deeds/Lightstone ReportDate, DOB, address dates
  const slashDMY = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2}):(\d{2}))?$/)
  if (slashDMY) {
    return new Date(
      Date.UTC(+slashDMY[3], +slashDMY[2] - 1, +slashDMY[1],
               +(slashDMY[4] ?? 0), +(slashDMY[5] ?? 0), +(slashDMY[6] ?? 0)),
    )
  }

  // 2. DD-MM-YYYY [HH:mm]  —  Sigma EnquiryDate, Telephone LastUpdatedDate
  const dashDMY = s.match(/^(\d{2})-(\d{2})-(\d{4})(?:\s+(\d{2}):(\d{2}))?$/)
  if (dashDMY) {
    return new Date(
      Date.UTC(+dashDMY[3], +dashDMY[2] - 1, +dashDMY[1],
               +(dashDMY[4] ?? 0), +(dashDMY[5] ?? 0)),
    )
  }

  // 3. YYYY/MM/DD  —  CIPC registration dates, change history
  const slashYMD = s.match(/^(\d{4})\/(\d{2})\/(\d{2})$/)
  if (slashYMD) {
    return new Date(Date.UTC(+slashYMD[1], +slashYMD[2] - 1, +slashYMD[3]))
  }

  // 4. YYYYMMDD or YYYY0000  —  Deeds/Lightstone sale/registration dates; year-only bonds use YYYY0000
  const numericYMD = s.match(/^(\d{4})(\d{2})(\d{2})$/)
  if (numericYMD) {
    const year  = +numericYMD[1]
    const month = +numericYMD[2]  // 0 means year-only entry → clamp to Jan
    const day   = +numericYMD[3]  // 0 means year-only entry → clamp to 1st
    return new Date(Date.UTC(year, Math.max(month - 1, 0), Math.max(day, 1)))
  }

  return null
}

export const parseSearchworxDateTime = parseSearchworxDate

// ─── Numeric coercion ─────────────────────────────────────────────────────────

export function parseIntOrZero(s: string | undefined | null): number {
  if (!s) return 0
  const n = parseInt(s, 10)
  return Number.isNaN(n) ? 0 : n
}

export function coerceNumericMap(obj: Record<string, string>): Record<string, number> {
  return Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, parseIntOrZero(v)]))
}

// ─── Owner type normalisation ─────────────────────────────────────────────────

export type OwnerType = "person" | "company" | "trust" | "secretary" | "unknown"

export function normaliseOwnerType(
  source: "deeds" | "lightstone" | "cipc",
  code: string,
): OwnerType {
  if (source === "deeds") {
    if (code === "1") return "person"
    if (code === "2") return "company"
    if (code === "3") return "trust"
  } else if (source === "lightstone") {
    if (code === "PP") return "person"
    if (code === "CO") return "company"
    if (code === "TR") return "trust"
  } else if (source === "cipc") {
    if (code === "D") return "person"    // director
    if (code === "S") return "secretary" // secretary (natural person)
    if (code === "P") return "secretary" // designated auditor (natural person — same UX)
    if (code === "A") return "company"   // auditor firm
  }
  return "unknown"
}
