import Papa from "papaparse"
import * as XLSX from "xlsx"

// ── Types ──────────────────────────────────────────────────────────────

export interface GLTransaction {
  date: Date
  type: "invoice" | "payment"
  amountCents: number
  description: string
  unitRef: string | null
  period: string | null
  rawDescription: string
}

export interface GLDepositTransaction {
  date: Date
  type: "deposit_received" | "deposit_interest" | "deposit_topup"
  debitCents: number
  creditCents: number
  rawDescription: string
}

export interface GLPropertyBlock {
  propertyName: string
  ownerName: string
  periodFrom: Date
  periodTo: Date
  arTransactions: GLTransaction[]
  depositTransactions: GLDepositTransaction[]
  closingBalance: number
  unitRefs: string[]
}

// ── Helper functions ───────────────────────────────────────────────────

const PROPERTY_HEADER_RE = /^(.+?)\((.+?)\)\s*$/
const UNIT_REF_RE = /\d{6}[/]?\d*-([A-Z0-9]+)\s*/i
const PERIOD_RE = /^(\d{6})/
const TPN_DATE_RE = /^(\d{4})\/(\d{2})\/(\d{2})$/
const CURRENCY_RE = /^(-?)R\s?([\d,]+\.\d{2})$/

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
]

function parseTpnDate(raw: string): Date {
  const trimmed = raw.trim()
  const match = TPN_DATE_RE.exec(trimmed)
  if (!match) {
    throw new Error(`Invalid TPN date format: "${trimmed}"`)
  }
  const year = Number.parseInt(match[1]!, 10)
  const month = Number.parseInt(match[2]!, 10) - 1
  const day = Number.parseInt(match[3]!, 10)
  return new Date(year, month, day)
}

function parseTpnCurrency(raw: string): number {
  const trimmed = raw.trim()
  if (!trimmed) return 0

  const match = CURRENCY_RE.exec(trimmed)
  if (match) {
    const sign = match[1] === "-" ? -1 : 1
    const cleaned = match[2]!.replace(/,/g, "")
    const value = Number.parseFloat(cleaned)
    if (Number.isNaN(value)) return 0
    return sign * Math.round(value * 100)
  }

  // Fallback: try plain number
  const cleaned = trimmed.replace(/[R\s,]/g, "")
  const value = Number.parseFloat(cleaned)
  if (Number.isNaN(value)) return 0
  return Math.round(value * 100)
}

function normaliseDescription(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .replace(/^\s+|\s+$/g, "")
    .replace(/\{[^}]*\}/g, "") // strip TPN template placeholders
    .trim()
}

function extractUnitRef(desc: string): string | null {
  const match = UNIT_REF_RE.exec(desc)
  return match ? match[1]!.toUpperCase() : null
}

function extractPeriod(desc: string): string | null {
  const match = PERIOD_RE.exec(desc)
  return match ? match[1]! : null
}

function formatPeriod(period: string): string {
  if (period.length !== 6) return period
  const year = period.slice(0, 4)
  const monthIdx = Number.parseInt(period.slice(4), 10) - 1
  const monthName = MONTH_NAMES[monthIdx]
  if (!monthName) return period
  return `${monthName} ${year}`
}

// ── CSV Parser ─────────────────────────────────────────────────────────

interface CsvRow {
  Property1?: string
  Account1?: string
  Date?: string
  Description?: string
  Debit?: string
  Credit?: string
  [key: string]: string | undefined
}

function isBeginningBalance(desc: string): boolean {
  return /beginning\s+balance/i.test(desc)
}

function classifyArTransaction(
  descRaw: string,
  debitCents: number,
  creditCents: number,
): GLTransaction["type"] {
  if (/invoice|rent\s*due/i.test(descRaw) || debitCents > 0) {
    return "invoice"
  }
  if (creditCents > 0) {
    return "payment"
  }
  return "invoice"
}

function classifyDepositType(desc: string): GLDepositTransaction["type"] {
  const lower = desc.toLowerCase()
  if (/interest/i.test(lower)) return "deposit_interest"
  if (/top[\s-]?up/i.test(lower)) return "deposit_topup"
  return "deposit_received"
}

export function parseGLCsv(csvText: string): GLPropertyBlock[] {
  const parsed = Papa.parse<CsvRow>(csvText, {
    header: true,
    skipEmptyLines: true,
  })

  // Group rows by Property1
  const grouped = new Map<string, CsvRow[]>()
  for (const row of parsed.data) {
    const prop = row.Property1?.trim()
    if (!prop) continue
    const existing = grouped.get(prop)
    if (existing) {
      existing.push(row)
    } else {
      grouped.set(prop, [row])
    }
  }

  const blocks: GLPropertyBlock[] = []

  for (const [propKey, rows] of grouped) {
    const headerMatch = PROPERTY_HEADER_RE.exec(propKey)
    if (!headerMatch) continue

    const propertyName = headerMatch[1]!.trim()
    const ownerName = headerMatch[2]!.trim()

    const arTransactions: GLTransaction[] = []
    const depositTransactions: GLDepositTransaction[] = []
    let closingBalance = 0
    const unitRefSet = new Set<string>()
    let earliestDate: Date | null = null
    let latestDate: Date | null = null

    for (const row of rows) {
      const account = row.Account1?.trim() ?? ""
      const dateStr = row.Date?.trim() ?? ""
      const descRaw = row.Description?.trim() ?? ""
      const debitCents = parseTpnCurrency(row.Debit ?? "")
      const creditCents = parseTpnCurrency(row.Credit ?? "")

      // Skip rows with no date (summary / header rows)
      if (!dateStr || !TPN_DATE_RE.test(dateStr)) continue

      const date = parseTpnDate(dateStr)
      if (!earliestDate || date < earliestDate) earliestDate = date
      if (!latestDate || date > latestDate) latestDate = date

      const desc = normaliseDescription(descRaw)

      if (account === "Accounts Receivable (Lease)") {
        // Skip beginning balance rows
        if (isBeginningBalance(descRaw)) continue

        // Skip zero-value rows
        const amount = debitCents > 0 ? debitCents : creditCents
        if (amount === 0) continue

        const unitRef = extractUnitRef(descRaw)
        const period = extractPeriod(descRaw)
        const type = classifyArTransaction(descRaw, debitCents, creditCents)

        if (unitRef) unitRefSet.add(unitRef)

        arTransactions.push({
          date,
          type,
          amountCents: Math.abs(amount),
          description: desc,
          unitRef,
          period,
          rawDescription: descRaw,
        })
      } else if (account === "Security Deposit Account (Agent)") {
        const depType = classifyDepositType(descRaw)
        depositTransactions.push({
          date,
          type: depType,
          debitCents: Math.abs(debitCents),
          creditCents: Math.abs(creditCents),
          rawDescription: descRaw,
        })
      }
    }

    // Calculate closing balance from AR transactions
    for (const tx of arTransactions) {
      if (tx.type === "invoice") {
        closingBalance += tx.amountCents
      } else {
        closingBalance -= tx.amountCents
      }
    }

    blocks.push({
      propertyName,
      ownerName,
      periodFrom: earliestDate ?? new Date(),
      periodTo: latestDate ?? new Date(),
      arTransactions,
      depositTransactions,
      closingBalance,
      unitRefs: [...unitRefSet],
    })
  }

  return blocks
}

// ── XLSX Parser ────────────────────────────────────────────────────────

function findHeaderRow(
  sheet: XLSX.WorkSheet,
): { headerRowIndex: number; headers: string[] } {
  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1")
  for (let r = range.s.r; r <= Math.min(range.e.r, 15); r++) {
    const rowValues: string[] = []
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c })
      const cell = sheet[addr] as XLSX.CellObject | undefined
      if (cell?.v != null && String(cell.v).trim() !== "") {
        rowValues.push(String(cell.v).trim())
      }
    }
    if (rowValues.length >= 3) {
      const headers: string[] = []
      for (let c = range.s.c; c <= range.e.c; c++) {
        const addr = XLSX.utils.encode_cell({ r, c })
        const cell = sheet[addr] as XLSX.CellObject | undefined
        const val = cell?.v != null ? String(cell.v).trim() : ""
        if (val !== "") headers.push(val)
      }
      return { headerRowIndex: r, headers }
    }
  }
  return { headerRowIndex: 0, headers: [] }
}

interface XlsxBlockBoundary {
  propertyHeader: string
  startRow: number
  endRow: number
}

const BLOCK_HEADER_RE = /^.+\(.+\)$/
const GRAND_TOTAL_RE = /grand\s*total/i

function getCellString(sheet: XLSX.WorkSheet, r: number, c: number): string {
  const addr = XLSX.utils.encode_cell({ r, c })
  const cell = sheet[addr] as XLSX.CellObject | undefined
  if (cell?.v == null) return ""
  return String(cell.v).trim()
}

function getCellValue(sheet: XLSX.WorkSheet, r: number, c: number): unknown {
  const addr = XLSX.utils.encode_cell({ r, c })
  const cell = sheet[addr] as XLSX.CellObject | undefined
  return cell?.v ?? null
}

function getCellDate(sheet: XLSX.WorkSheet, r: number, c: number): Date | null {
  const addr = XLSX.utils.encode_cell({ r, c })
  const cell = sheet[addr] as XLSX.CellObject | undefined
  if (!cell) return null
  if (cell.t === "d" && cell.v instanceof Date) return cell.v
  if (cell.t === "n" && typeof cell.v === "number") {
    // Excel serial date
    const date = XLSX.SSF.parse_date_code(cell.v)
    if (date) return new Date(date.y, date.m - 1, date.d)
  }
  return null
}

function getCellNumber(sheet: XLSX.WorkSheet, r: number, c: number): number {
  const val = getCellValue(sheet, r, c)
  if (typeof val === "number") return Math.round(val * 100)
  if (typeof val === "string") return parseTpnCurrency(val)
  return 0
}

export function parseGLXlsx(buffer: ArrayBuffer): GLPropertyBlock[] {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true })

  const firstSheetName = workbook.SheetNames.at(0)
  if (!firstSheetName) {
    throw new Error("XLSX file has no sheets")
  }

  const sheet = workbook.Sheets[firstSheetName]
  if (!sheet) {
    throw new Error("Could not read first sheet")
  }

  const range = XLSX.utils.decode_range(sheet["!ref"] ?? "A1")

  // Find block boundaries: property header in col D (index 3)
  const boundaries: XlsxBlockBoundary[] = []
  for (let r = range.s.r; r <= range.e.r; r++) {
    const colD = getCellString(sheet, r, 3)
    if (BLOCK_HEADER_RE.test(colD)) {
      if (boundaries.length > 0) {
        const prev = boundaries.at(-1)!
        prev.endRow = r - 1
      }
      boundaries.push({ propertyHeader: colD, startRow: r, endRow: range.e.r })
    }
    if (GRAND_TOTAL_RE.test(colD)) {
      if (boundaries.length > 0) {
        const prev = boundaries.at(-1)!
        prev.endRow = r - 1
      }
    }
  }

  const blocks: GLPropertyBlock[] = []

  for (const boundary of boundaries) {
    const headerMatch = PROPERTY_HEADER_RE.exec(boundary.propertyHeader)
    if (!headerMatch) continue

    const propertyName = headerMatch[1]!.trim()
    const ownerName = headerMatch[2]!.trim()

    const arTransactions: GLTransaction[] = []
    const depositTransactions: GLDepositTransaction[] = []
    const unitRefSet = new Set<string>()
    let earliestDate: Date | null = null
    let latestDate: Date | null = null
    let closingBalance = 0

    let currentSection = ""

    for (let r = boundary.startRow; r <= boundary.endRow; r++) {
      // Detect section from col C (index 2)
      const colC = getCellString(sheet, r, 2)
      if (colC === "Accounts Receivable (Lease)") {
        currentSection = "ar"
        continue
      }
      if (colC === "Security Deposit Account (Agent)") {
        currentSection = "deposit"
        continue
      }
      if (colC && colC !== currentSection) {
        // Other section header — skip unless known
        if (!colC.includes("Accounts Receivable") && !colC.includes("Security Deposit")) {
          currentSection = "other"
        }
      }

      // Transaction rows: col D should be a Date
      const date = getCellDate(sheet, r, 3)
      if (!date) continue

      if (!earliestDate || date < earliestDate) earliestDate = date
      if (!latestDate || date > latestDate) latestDate = date

      // Description typically in col E (index 4), debit in col F (5), credit in col G (6)
      const descRaw = getCellString(sheet, r, 4)
      const debitCents = getCellNumber(sheet, r, 5)
      const creditCents = getCellNumber(sheet, r, 6)

      if (currentSection === "ar") {
        const desc = normaliseDescription(descRaw)
        if (isBeginningBalance(descRaw)) continue

        const amount = debitCents > 0 ? debitCents : creditCents
        if (amount === 0) continue

        const unitRef = extractUnitRef(descRaw)
        const period = extractPeriod(descRaw)
        const type: GLTransaction["type"] =
          /invoice|rent\s*due/i.test(descRaw) || debitCents > 0
            ? "invoice"
            : "payment"

        if (unitRef) unitRefSet.add(unitRef)

        arTransactions.push({
          date,
          type,
          amountCents: Math.abs(amount),
          description: desc,
          unitRef,
          period,
          rawDescription: descRaw,
        })
      } else if (currentSection === "deposit") {
        const depType = classifyDepositType(descRaw)
        depositTransactions.push({
          date,
          type: depType,
          debitCents: Math.abs(debitCents),
          creditCents: Math.abs(creditCents),
          rawDescription: descRaw,
        })
      }
    }

    // Calculate closing balance from AR
    for (const tx of arTransactions) {
      if (tx.type === "invoice") {
        closingBalance += tx.amountCents
      } else {
        closingBalance -= tx.amountCents
      }
    }

    blocks.push({
      propertyName,
      ownerName,
      periodFrom: earliestDate ?? new Date(),
      periodTo: latestDate ?? new Date(),
      arTransactions,
      depositTransactions,
      closingBalance,
      unitRefs: [...unitRefSet],
    })
  }

  return blocks
}
