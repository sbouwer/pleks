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

const PROPERTY_HEADER_RE = /^([^(]{1,200})\(([^)]{1,200})\)\s{0,10}$/
const UNIT_REF_RE = /\d{6}\/??\d{0,6}-([A-Z0-9]+)\s{0,20}/i
const PERIOD_RE = /^(\d{6})/
const TPN_DATE_RE = /^(\d{4})\/(\d{2})\/(\d{2})$/
const CURRENCY_RE = /^(-?)R\s?([\d,]+\.\d{2})$/


function parseTpnDate(raw: string): Date {
  const trimmed = raw.trim()
  const match = TPN_DATE_RE.exec(trimmed)
  if (!match) {
    throw new Error(`Invalid TPN date format: "${trimmed}"`)
  }
  const year = Number.parseInt(match[1] ?? "", 10)
  const month = Number.parseInt(match[2] ?? "", 10) - 1
  const day = Number.parseInt(match[3] ?? "", 10)
  return new Date(year, month, day)
}

function parseTpnCurrency(raw: string): number {
  const trimmed = raw.trim()
  if (!trimmed) return 0

  const match = CURRENCY_RE.exec(trimmed)
  if (match) {
    const sign = match[1] === "-" ? -1 : 1
    const cleaned = (match[2] ?? "").replaceAll(",", "")
    const value = Number.parseFloat(cleaned)
    if (Number.isNaN(value)) return 0
    return sign * Math.round(value * 100)
  }

  // Fallback: try plain number
  const cleaned = trimmed.replaceAll(/[R\s,]/g, "")
  const value = Number.parseFloat(cleaned)
  if (Number.isNaN(value)) return 0
  return Math.round(value * 100)
}

function normaliseDescription(raw: string): string {
  return raw
    .replaceAll(/\s+/g, " ")
    .replaceAll(/\{[^}]{0,200}\}/g, "") // strip TPN template placeholders
    .trim()
}

function extractUnitRef(desc: string): string | null {
  const match = UNIT_REF_RE.exec(desc)
  return match ? (match[1] ?? "").toUpperCase() : null
}

function extractPeriod(desc: string): string | null {
  const match = PERIOD_RE.exec(desc)
  return match ? (match[1] ?? null) : null
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

function calcClosingBalance(arTransactions: GLTransaction[]): number {
  let balance = 0
  for (const tx of arTransactions) {
    if (tx.type === "invoice") {
      balance += tx.amountCents
    } else {
      balance -= tx.amountCents
    }
  }
  return balance
}

function updateDateRange(
  date: Date,
  earliest: Date | null,
  latest: Date | null,
): { earliest: Date; latest: Date } {
  return {
    earliest: !earliest || date < earliest ? date : earliest,
    latest: !latest || date > latest ? date : latest,
  }
}

interface CsvArAccumulator {
  arTransactions: GLTransaction[]
  unitRefSet: Set<string>
}

function processCsvArRow(
  date: Date,
  descRaw: string,
  debitCents: number,
  creditCents: number,
  acc: CsvArAccumulator,
): void {
  if (isBeginningBalance(descRaw)) return

  const amount = debitCents > 0 ? debitCents : creditCents
  if (amount === 0) return

  const unitRef = extractUnitRef(descRaw)
  const period = extractPeriod(descRaw)
  const type = classifyArTransaction(descRaw, debitCents, creditCents)

  if (unitRef) acc.unitRefSet.add(unitRef)

  acc.arTransactions.push({
    date,
    type,
    amountCents: Math.abs(amount),
    description: normaliseDescription(descRaw),
    unitRef,
    period,
    rawDescription: descRaw,
  })
}

function processCsvDepositRow(
  date: Date,
  descRaw: string,
  debitCents: number,
  creditCents: number,
  depositTransactions: GLDepositTransaction[],
): void {
  depositTransactions.push({
    date,
    type: classifyDepositType(descRaw),
    debitCents: Math.abs(debitCents),
    creditCents: Math.abs(creditCents),
    rawDescription: descRaw,
  })
}

function groupCsvRowsByProperty(data: CsvRow[]): Map<string, CsvRow[]> {
  const grouped = new Map<string, CsvRow[]>()
  for (const row of data) {
    const prop = row.Property1?.trim()
    if (!prop) continue
    const existing = grouped.get(prop)
    if (existing) {
      existing.push(row)
    } else {
      grouped.set(prop, [row])
    }
  }
  return grouped
}

function buildCsvPropertyBlock(
  propertyName: string,
  ownerName: string,
  rows: CsvRow[],
): GLPropertyBlock {
  const acc: CsvArAccumulator = { arTransactions: [], unitRefSet: new Set() }
  const depositTransactions: GLDepositTransaction[] = []
  let earliestDate: Date | null = null
  let latestDate: Date | null = null

  for (const row of rows) {
    const account = row.Account1?.trim() ?? ""
    const dateStr = row.Date?.trim() ?? ""
    const descRaw = row.Description?.trim() ?? ""
    const debitCents = parseTpnCurrency(row.Debit ?? "")
    const creditCents = parseTpnCurrency(row.Credit ?? "")

    if (!dateStr || !TPN_DATE_RE.test(dateStr)) continue

    const date = parseTpnDate(dateStr)
    ;({ earliest: earliestDate, latest: latestDate } = updateDateRange(date, earliestDate, latestDate))

    if (account === "Accounts Receivable (Lease)") {
      processCsvArRow(date, descRaw, debitCents, creditCents, acc)
    } else if (account === "Security Deposit Account (Agent)") {
      processCsvDepositRow(date, descRaw, debitCents, creditCents, depositTransactions)
    }
  }

  return {
    propertyName,
    ownerName,
    periodFrom: earliestDate ?? new Date(),
    periodTo: latestDate ?? new Date(),
    arTransactions: acc.arTransactions,
    depositTransactions,
    closingBalance: calcClosingBalance(acc.arTransactions),
    unitRefs: [...acc.unitRefSet],
  }
}

export function parseGLCsv(csvText: string): GLPropertyBlock[] {
  const parsed = Papa.parse<CsvRow>(csvText, {
    header: true,
    skipEmptyLines: true,
  })

  const grouped = groupCsvRowsByProperty(parsed.data)
  const blocks: GLPropertyBlock[] = []

  for (const [propKey, rows] of grouped) {
    const headerMatch = PROPERTY_HEADER_RE.exec(propKey)
    if (!headerMatch) continue

    const propertyName = (headerMatch[1] ?? "").trim()
    const ownerName = (headerMatch[2] ?? "").trim()

    blocks.push(buildCsvPropertyBlock(propertyName, ownerName, rows))
  }

  return blocks
}

// ── XLSX Parser ────────────────────────────────────────────────────────


interface XlsxBlockBoundary {
  propertyHeader: string
  startRow: number
  endRow: number
}

const BLOCK_HEADER_RE = /^[^(]{1,200}\([^)]{1,200}\)$/
const GRAND_TOTAL_RE = /grand\s{0,5}total/i

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

function findXlsxBoundaries(
  sheet: XLSX.WorkSheet,
  range: XLSX.Range,
): XlsxBlockBoundary[] {
  const boundaries: XlsxBlockBoundary[] = []

  for (let r = range.s.r; r <= range.e.r; r++) {
    const colD = getCellString(sheet, r, 3)

    if (BLOCK_HEADER_RE.test(colD)) {
      if (boundaries.length > 0) {
        boundaries.at(-1)!.endRow = r - 1
      }
      boundaries.push({ propertyHeader: colD, startRow: r, endRow: range.e.r })
    }

    if (GRAND_TOTAL_RE.test(colD) && boundaries.length > 0) {
      boundaries.at(-1)!.endRow = r - 1
    }
  }

  return boundaries
}

function detectXlsxSection(colC: string, current: string): string {
  if (colC === "Accounts Receivable (Lease)") return "ar"
  if (colC === "Security Deposit Account (Agent)") return "deposit"
  if (
    colC &&
    colC !== current &&
    !colC.includes("Accounts Receivable") &&
    !colC.includes("Security Deposit")
  ) {
    return "other"
  }
  return current
}

function processXlsxArRow(
  date: Date,
  descRaw: string,
  debitCents: number,
  creditCents: number,
  acc: CsvArAccumulator,
): void {
  if (isBeginningBalance(descRaw)) return

  const amount = debitCents > 0 ? debitCents : creditCents
  if (amount === 0) return

  const unitRef = extractUnitRef(descRaw)
  const period = extractPeriod(descRaw)
  const type: GLTransaction["type"] =
    /invoice|rent\s*due/i.test(descRaw) || debitCents > 0 ? "invoice" : "payment"

  if (unitRef) acc.unitRefSet.add(unitRef)

  acc.arTransactions.push({
    date,
    type,
    amountCents: Math.abs(amount),
    description: normaliseDescription(descRaw),
    unitRef,
    period,
    rawDescription: descRaw,
  })
}

function buildXlsxPropertyBlock(
  propertyName: string,
  ownerName: string,
  boundary: XlsxBlockBoundary,
  sheet: XLSX.WorkSheet,
): GLPropertyBlock {
  const acc: CsvArAccumulator = { arTransactions: [], unitRefSet: new Set() }
  const depositTransactions: GLDepositTransaction[] = []
  let earliestDate: Date | null = null
  let latestDate: Date | null = null
  let currentSection = ""

  for (let r = boundary.startRow; r <= boundary.endRow; r++) {
    const colC = getCellString(sheet, r, 2)
    const nextSection = detectXlsxSection(colC, currentSection)
    if (nextSection !== currentSection) {
      currentSection = nextSection
      if (colC) continue // section header row — no transaction data
    }

    const date = getCellDate(sheet, r, 3)
    if (!date) { continue }

    ;({ earliest: earliestDate, latest: latestDate } = updateDateRange(date, earliestDate, latestDate))

    const descRaw = getCellString(sheet, r, 4)
    const debitCents = getCellNumber(sheet, r, 5)
    const creditCents = getCellNumber(sheet, r, 6)

    if (currentSection === "ar") {
      processXlsxArRow(date, descRaw, debitCents, creditCents, acc)
    } else if (currentSection === "deposit") {
      processCsvDepositRow(date, descRaw, debitCents, creditCents, depositTransactions)
    }
  }

  return {
    propertyName,
    ownerName,
    periodFrom: earliestDate ?? new Date(),
    periodTo: latestDate ?? new Date(),
    arTransactions: acc.arTransactions,
    depositTransactions,
    closingBalance: calcClosingBalance(acc.arTransactions),
    unitRefs: [...acc.unitRefSet],
  }
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
  const boundaries = findXlsxBoundaries(sheet, range)
  const blocks: GLPropertyBlock[] = []

  for (const boundary of boundaries) {
    const headerMatch = PROPERTY_HEADER_RE.exec(boundary.propertyHeader)
    if (!headerMatch) continue

    const propertyName = (headerMatch[1] ?? "").trim()
    const ownerName = (headerMatch[2] ?? "").trim()

    blocks.push(buildXlsxPropertyBlock(propertyName, ownerName, boundary, sheet))
  }

  return blocks
}
