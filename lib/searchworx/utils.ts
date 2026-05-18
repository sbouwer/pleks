/**
 * lib/searchworx/utils.ts — Shared Searchworx parsing helpers
 *
 * Notes:  ADDENDUM_14H §4.3 + Amendment §C, §D, §L, §M, §O (v3). Five date patterns; two monetary
 *         formats (zero-padded cents for TU, decimal Rand for XDS/VeriCred). Each product elides
 *         absent fields differently (Sigma omits, Deeds/CIPC use "-"). Callers receive typed values.
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

  // 4. YYYY-MM-DD  —  XDS LastUpdatedDate, VeriCred IDIssuedDate / AccountOpenDate / DateOfBirth
  const isoDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (isoDate) {
    return new Date(Date.UTC(+isoDate[1], +isoDate[2] - 1, +isoDate[3]))
  }

  // 5. YYYYMMDD or YYYY0000  —  Deeds/Lightstone sale/registration dates; year-only bonds use YYYY0000
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

// ─── Monetary coercion ────────────────────────────────────────────────────────

// TransUnion AdverseAmount: 9-digit zero-padded cents string → integer cents.
// "000000700" → 700, "000017000" → 17000.
export function parseSearchworxCentsZeroPadded(s: string | undefined | null): number {
  if (!s) return 0
  const cleaned = s.replace(/^0+/, "") || "0"
  const n = Number.parseInt(cleaned, 10)
  return Number.isNaN(n) ? 0 : n
}

// XDS/VeriCred decimal Rand format → integer cents.
// "0.0000" → 0, "1550" → 155000, "170.00" → 17000.
export function parseSearchworxRandDecimal(s: string | undefined | null): number {
  if (!s) return 0
  const f = Number.parseFloat(s)
  if (Number.isNaN(f)) return 0
  return Math.round(f * 100)
}

// ─── Identity normalisation ───────────────────────────────────────────────────

export type NormalisedGender = "male" | "female" | "unknown"

// Normalise gender across bureau encodings (M/F, Male/Female, MALE/FEMALE).
export function normaliseGender(raw: string | undefined | null): NormalisedGender {
  if (!raw) return "unknown"
  const lower = raw.trim().toLowerCase()
  if (lower === "m" || lower === "male")   return "male"
  if (lower === "f" || lower === "female") return "female"
  return "unknown"
}

// Normalise Searchworx phone formats to E.164. Returns null for unparseable / missing values.
// Handles:
//   DialCode + Number object (XDS):          {DialCode:"011", Number:"8940999"} → "+27118940999"
//   International DialCode (XDS Namibia):    {DialCode:"26464", Number:"412906"} → "+26464412906"
//   Parenthesised local string (TU):         "(011) 8940999" → "+27118940999"
//   Parenthesised international (TU):        "(26464) 412906" → "+26464412906"
//   Leading-dash cleaned (Combined-via-TU):  "- 0987676543" → "+27987676543"
//   20-char zero-padded mobile (TU standalone): "00000000000987676543" → "+27987676543"
//   Plain SA local:                          "0118940999" → "+27118940999"
export function normaliseSearchworxPhone(raw: {
  DialCode?:   string
  Number?:     string
  FullNumber?: string
} | undefined | null): string | null {
  if (!raw) return null

  // DialCode + Number object (XDS, Combined-via-TU structured phones)
  if ("DialCode" in raw || "Number" in raw) {
    return _normaliseDialCodePhone(raw.DialCode ?? "", raw.Number ?? "")
  }

  const s = (raw.FullNumber ?? "").trim()
  if (!s || s === "-" || s === "--" || s === "- -") return null

  // 20-char zero-padded mobile: "00000000000987676543" → strip leading zeros → SA 9-digit base
  if (/^0{10}\d{9,10}$/.test(s)) return `+27${s.replace(/^0+/, "")}`

  // Leading-dash cleaned format from Combined-via-TU: "- 0987676543"
  const dashPrefix = /^-\s*0(\d{9})$/.exec(s)
  if (dashPrefix) return `+27${dashPrefix[1]}`

  // Parenthesised prefix: "(011) 8940999" or "(26464) 412906"
  const parenMatch = /^\((\d+)\)\s*(\d+)$/.exec(s)
  if (parenMatch) {
    const prefix = parenMatch[1]
    return prefix.startsWith("0")
      ? `+27${prefix.slice(1)}${parenMatch[2]}`
      : `+${prefix}${parenMatch[2]}`
  }

  // Plain 10-digit SA local: "0118940999"
  const plainSA = /^0(\d{9})$/.exec(s)
  return plainSA ? `+27${plainSA[1]}` : null
}

function _normaliseDialCodePhone(dialCode: string, number: string): string | null {
  const dialDigits = dialCode.replace(/\D/g, "")
  const numDigits  = number.replace(/\D/g, "")
  if (!numDigits) return null
  if (dialDigits.startsWith("0")) return `+27${dialDigits.slice(1)}${numDigits}`
  if (dialDigits)                 return `+${dialDigits}${numDigits}`
  return numDigits.startsWith("0") ? `+27${numDigits.slice(1)}` : `+27${numDigits}`
}

// ─── Search envelope ─────────────────────────────────────────────────────────

export interface SearchInformationParsed {
  searchToken:          string
  reportDate:           Date | null
  reference:            string
  searchDescription:    string
  callerModule:         string
  searchId:             number
  dataSupplier:         number
  searchType:           number
  dataSupplierDesc:     string
  searchTypeDescription: string
}

export function parseSearchInformation(raw: Record<string, unknown>): SearchInformationParsed {
  return {
    searchToken:           String(raw.SearchToken         ?? ""),
    reportDate:            parseSearchworxDate(raw.ReportDate as string | undefined),
    reference:             String(raw.Reference           ?? ""),
    searchDescription:     String(raw.SearchDescription   ?? ""),
    callerModule:          String(raw.CallerModule        ?? ""),
    searchId:              typeof raw.SearchID === "number" ? raw.SearchID : parseIntOrZero(String(raw.SearchID ?? 0)),
    dataSupplier:          typeof raw.DataSupplier === "number" ? raw.DataSupplier : parseIntOrZero(String(raw.DataSupplier ?? 0)),
    searchType:            typeof raw.SearchType === "number" ? raw.SearchType : parseIntOrZero(String(raw.SearchType ?? 0)),
    dataSupplierDesc:      String(raw.DataSupplierDesc    ?? ""),
    searchTypeDescription: String(raw.SearchTypeDescription ?? ""),
  }
}

// ─── Request formatting ───────────────────────────────────────────────────────

// Format a JS Date for Searchworx request bodies in the required endpoint format.
// Always uses UTC components to avoid DST-shifted dates.
export function formatSearchworxDateForRequest(
  date: Date | string,
  format: "ddMMyyyy" | "dd/MM/yyyy" | "yyyyMMdd" | "yyyy-MM-dd",
): string {
  const d    = typeof date === "string" ? new Date(date) : date
  const yyyy = d.getUTCFullYear().toString()
  const MM   = String(d.getUTCMonth() + 1).padStart(2, "0")
  const dd   = String(d.getUTCDate()).padStart(2, "0")
  switch (format) {
    case "dd/MM/yyyy": return `${dd}/${MM}/${yyyy}`
    case "ddMMyyyy":   return `${dd}${MM}${yyyy}`
    case "yyyyMMdd":   return `${yyyy}${MM}${dd}`
    case "yyyy-MM-dd": return `${yyyy}-${MM}-${dd}`
  }
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
