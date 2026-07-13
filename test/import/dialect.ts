/**
 * test/import/dialect.ts — render ONE ground truth into the many file shapes agencies actually upload
 *
 * Notes:  The same book, exported by PayProp, by WeconnectU, by TPN, or by an Excel with an af-ZA locale,
 *         produces very different BYTES. Headers differ. "6600.50" becomes "6 600,50". A date flips from
 *         2026-03-01 to 01/03/2026 to the integer 46082. None of that is corruption — it is the same book.
 *
 *         THE DIALECT INVARIANT:
 *
 *             A benign dialect change must produce a BYTE-IDENTICAL ground-truth outcome.
 *             Same book, different exporter ⇒ same database.
 *
 *         That single assertion is what would have caught the 100× af-ZA comma bug (`"6 600,50"` read as
 *         660050 cents in one dialect and 6600 in another) and the day/month locale swap — both of which
 *         shipped, and both of which are invisible to any test that only ever renders one dialect.
 *
 *         Rendering goes through the REAL parse path — papaparse and SheetJS, called exactly as
 *         Step0Upload calls them — because the bugs of the last fortnight lived in COMPOSITION, not in any
 *         parser taken alone.
 */
import Papa from "papaparse"
import * as XLSX from "xlsx"
import type { GroundTruth, GtRow } from "./book"

export type DialectName = "en-ZA" | "af-ZA" | "tpn" | "payprop" | "excel-numeric"

/** A Pleks-side key → the header an exporter emits for it. Missing key = that exporter has no such column. */
type HeaderMap = Partial<Record<keyof GtRow | "entityType", string>>

/**
 * Four real-world exporters, plus one that writes numbers as numbers.
 *
 * The header names are the point: `matchColumns` must RECOGNISE them. If an agency's real header does not
 * auto-map, the agent lands on a dropdown they have to guess at — so an unrecognised header here is itself
 * a finding, not a fixture problem.
 */
const DIALECTS: Record<DialectName, HeaderMap> = {
  "en-ZA": {
    entityType: "Type",
    propertyName: "Property Name", addressLine1: "Address", suburb: "Suburb", city: "City", province: "Province",
    unitNumber: "Unit Number",
    firstName: "First Name", lastName: "Surname", companyName: "Company Name",
    email: "Email", phone: "Cell", idNumber: "ID Number",
    leaseStart: "Lease Start", leaseEnd: "Lease End",
    rentCents: "Monthly Rent", depositCents: "Deposit",
    leaseType: "Lease Type", escalationType: "Escalation Type", escalationPercent: "Escalation %",
    paymentDueDay: "Payment Due Day", noticePeriodDays: "Notice Period Days",
    depositReturnDays: "Deposit Return Days", isFixedTerm: "Fixed Term", cpaApplies: "CPA Applies",
    paymentReference: "Payment Reference", bankAccount: "Bank Account", bankName: "Bank Name",
    registrationNumber: "Registration Number", vatNumber: "VAT Number",
  },
  // Afrikaans headers + af-ZA numerals. This is not exotic: an Excel installed in South Africa defaults to it.
  "af-ZA": {
    entityType: "Tipe",
    propertyName: "Eiendom Naam", addressLine1: "Adres", suburb: "Voorstad", city: "Stad", province: "Provinsie",
    unitNumber: "Eenheid", firstName: "Naam", lastName: "Van", companyName: "Maatskappy",
    email: "E-pos", phone: "Sel", idNumber: "ID Nommer",
    leaseStart: "Huur Begin", leaseEnd: "Huur Eindig",
    rentCents: "Maandelikse Huur", depositCents: "Deposito",
    leaseType: "Huurtipe", escalationType: "Escalation Type", escalationPercent: "Eskalasie",
    paymentDueDay: "Payment Due Day", noticePeriodDays: "Notice Period Days",
    depositReturnDays: "Deposit Return Days", isFixedTerm: "Fixed Term", cpaApplies: "CPA Applies",
    paymentReference: "Payment Reference", bankAccount: "Bank Rekening", bankName: "Bank Naam",
    registrationNumber: "Registration Number", vatNumber: "VAT Number",
  },
  tpn: {
    entityType: "Contact Type",
    propertyName: "Property", addressLine1: "Address Line 1", city: "City", province: "Province",
    unitNumber: "Unit", firstName: "First Name", lastName: "Last Name", companyName: "Trading Name",
    email: "Email Address", phone: "Mobile", idNumber: "Identity Number",
    leaseStart: "Commencement Date", leaseEnd: "Termination Date",
    rentCents: "Rental Amount", depositCents: "Deposit Amount",
    leaseType: "Lease Type", escalationType: "Escalation Type", escalationPercent: "Escalation Rate",
    paymentDueDay: "Payment Due Day", noticePeriodDays: "Notice Period",
    depositReturnDays: "Deposit Return Days", isFixedTerm: "Fixed Term", cpaApplies: "CPA Applies",
    // NOT "Reference" — in a TPN export that is TPN's OWN record id (`tpn_reference`), and the alias table is
    // right to claim it. The harness's first draft asserted otherwise and would have driven a "fix" that wrote
    // a bureau id into the bank-matching key. The oracle can be wrong too; when it is, it must yield.
    paymentReference: "Payment Reference", bankAccount: "Account Number", bankName: "Bank",
    registrationNumber: "Registration Number", vatNumber: "VAT Number",
  },
  payprop: {
    entityType: "Type",
    propertyName: "Building", addressLine1: "Street Address", suburb: "Suburb", city: "Town", province: "Province",
    unitNumber: "Unit No", firstName: "Tenant First Name", lastName: "Tenant Last Name",
    companyName: "Company Name", email: "Tenant Email", phone: "Tenant Mobile", idNumber: "ID/Passport",
    leaseStart: "Start Date", leaseEnd: "End Date",
    rentCents: "Rent", depositCents: "Deposit Held",
    leaseType: "Lease Type", escalationType: "Escalation Type", escalationPercent: "Annual Escalation",
    paymentDueDay: "Payment Due Day", noticePeriodDays: "Notice Period Days",
    depositReturnDays: "Deposit Return Days", isFixedTerm: "Fixed Term", cpaApplies: "CPA Applies",
    paymentReference: "Payment Reference", bankAccount: "Bank Account", bankName: "Bank Name",
    registrationNumber: "Registration Number", vatNumber: "VAT Number",
  },
  "excel-numeric": { ...{} as HeaderMap },   // headers as en-ZA; see below — differs in CELL TYPE, not name
}
DIALECTS["excel-numeric"] = { ...DIALECTS["en-ZA"] }

export interface DialectOptions {
  /** af-ZA writes "6 600,50"; en-ZA writes "6600.50". A units error here is a 100× error in the ledger. */
  decimalComma?: boolean
  /** Date rendering. `serial` is what Excel hands you when a column is formatted as a date: 46082, not a date. */
  dateFormat?: "dmy-slash" | "iso" | "excel-serial"
  /** A UTF-8 BOM. Excel writes one. A parser that does not strip it turns "Type" into "﻿Type". */
  bom?: boolean
  crlf?: boolean
  /** XLSX instead of CSV — the cell TYPE differs, which is where `raw:false` earns its keep. */
  xlsx?: boolean
}

const DIALECT_DEFAULTS: Record<DialectName, DialectOptions> = {
  "en-ZA": { dateFormat: "dmy-slash" },
  "af-ZA": { decimalComma: true, dateFormat: "dmy-slash", bom: true, crlf: true },
  tpn: { dateFormat: "iso" },
  payprop: { dateFormat: "dmy-slash" },
  "excel-numeric": { dateFormat: "excel-serial", xlsx: true },
}

// ── Value formatting ─────────────────────────────────────────────────────────────────────────────

/** Cents → the string this exporter would write. af-ZA: "6 600,50" (nbsp-free space + comma). */
function money(cents: number, o: DialectOptions): string {
  const rands = (cents / 100).toFixed(2)
  if (!o.decimalComma) return rands
  const [whole, frac] = rands.split(".")

  // Grouped by hand, not by lookahead. The idiomatic `\B(?=(\d{3})+(?!\d))` backtracks super-linearly, and
  // this runs once per money cell of a 5 000-row book — the same ReDoS lesson the email check already taught.
  let grouped = ""
  for (let i = 0; i < whole.length; i++) {
    const fromEnd = whole.length - i
    if (i > 0 && fromEnd % 3 === 0) grouped += " "
    grouped += whole[i]
  }
  return `${grouped},${frac}`
}

/** Excel's serial epoch: day 1 is 1900-01-01, with the famous phantom 1900-02-29 — hence the +1. */
function excelSerial(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number)
  const days = Date.UTC(y, m - 1, d) / 86_400_000
  return days + 25569
}

function date(iso: string, o: DialectOptions): string {
  if (o.dateFormat === "iso") return iso
  if (o.dateFormat === "excel-serial") return String(excelSerial(iso))
  const [y, m, d] = iso.split("-")
  return `${d}/${m}/${y}`
}

/** The escalation cell. "None" is written as a WORD with a BLANK percentage — the dangerous shape. */
function escalationCells(row: GtRow, o: DialectOptions): { basis: string; percent: string } {
  if (row.escalationType === "none") return { basis: "None", percent: "" }
  const basis = row.escalationType === "cpi" ? "CPI" : "Fixed"
  if (row.escalationPercent === undefined) return { basis, percent: "" }
  const pct = String(row.escalationPercent)
  return { basis, percent: o.decimalComma ? pct.replace(".", ",") : pct }
}

/** The lease half of a tenant row. Split out so `renderRow` stays legible. */
function putLeaseCells(
  row: GtRow, o: DialectOptions,
  put: (key: keyof HeaderMap, value: string | undefined) => void,
): void {
  put("propertyName", row.propertyName)
  put("addressLine1", row.addressLine1)
  put("suburb", row.suburb)
  put("city", row.city)
  put("province", row.province)
  put("unitNumber", row.unitNumber)
  put("leaseStart", row.leaseStart ? date(row.leaseStart, o) : undefined)
  // A month-to-month lease has NO end date. Rendering "" is the truth, not an omission.
  put("leaseEnd", row.leaseEnd ? date(row.leaseEnd, o) : "")
  put("rentCents", row.rentCents !== undefined ? money(row.rentCents, o) : undefined)
  put("depositCents", row.depositCents !== undefined ? money(row.depositCents, o) : undefined)
  put("leaseType", row.leaseType === "commercial" ? "Commercial" : "Residential")

  const esc = escalationCells(row, o)
  put("escalationType", esc.basis)
  put("escalationPercent", esc.percent)

  put("paymentDueDay", row.paymentDueDay !== undefined ? String(row.paymentDueDay) : undefined)
  put("noticePeriodDays", row.noticePeriodDays !== undefined ? String(row.noticePeriodDays) : undefined)
  put("depositReturnDays", row.depositReturnDays !== undefined ? String(row.depositReturnDays) : undefined)
  put("isFixedTerm", row.isFixedTerm ? "Y" : "N")
  put("cpaApplies", row.cpaApplies ? "Y" : "N")
  put("paymentReference", row.paymentReference)
  put("bankAccount", row.bankAccount)
  put("bankName", row.bankName)
}

const ENTITY_WORD: Record<GtRow["entity"], string> = {
  tenant: "Tenant", landlord: "Landlord", vendor: "Supplier", agent: "Agent",
}

/** A vendor's entity-type cell must carry the ARCHETYPE, since that is what `resolveSupplierType` reads. */
function entityCell(row: GtRow): string {
  if (row.entity !== "vendor") return ENTITY_WORD[row.entity]
  if (row.supplierType === "managing_scheme") return "Body Corporate"
  if (row.supplierType === "utility") return "Municipality"
  return "Contractor"
}

/** One ground-truth row → the cells this exporter would write for it. */
function renderRow(row: GtRow, h: HeaderMap, o: DialectOptions): Record<string, string> {
  const c: Record<string, string> = {}
  const put = (key: keyof HeaderMap, value: string | undefined) => {
    const header = h[key]
    if (header && value !== undefined && value !== null) c[header] = value
  }

  put("entityType", entityCell(row))
  put("firstName", row.firstName)
  put("lastName", row.lastName)
  put("companyName", row.companyName)
  put("email", row.email)
  put("phone", row.phone)
  put("idNumber", row.idNumber)
  put("registrationNumber", row.registrationNumber)
  put("vatNumber", row.vatNumber)

  if (row.entity === "tenant") putLeaseCells(row, o, put)

  return c
}

export interface RenderedBook {
  dialect: DialectName
  headers: string[]
  /** The cells as the WIZARD will see them — i.e. after a real papaparse / SheetJS round trip. */
  rows: Record<string, string>[]
}

/**
 * Render + serialise + parse back. The round trip through real bytes is the whole point: an in-memory
 * object never has a BOM, never has a CRLF, never turns a date into 46082, and never quotes a comma.
 */
export function render(
  truth: GroundTruth,
  dialect: DialectName,
  override: DialectOptions = {},
): RenderedBook {
  const o = { ...DIALECT_DEFAULTS[dialect], ...override }
  const h = DIALECTS[dialect]

  const raw = truth.rows.map((r) => renderRow(r, h, o))
  const headers = [...new Set(raw.flatMap((r) => Object.keys(r)))]
  const table = raw.map((r) => headers.map((k) => r[k] ?? ""))

  return { dialect, headers, ...roundTrip(headers, table, o) }
}

/** Serialise to real bytes and read them back exactly as the wizard's Step0Upload does. */
function roundTrip(
  headers: string[], table: string[][], o: DialectOptions,
): { rows: Record<string, string>[] } {
  if (o.xlsx) {
    const sheet = XLSX.utils.aoa_to_sheet([headers, ...table])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, sheet, "Book")
    const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer
    const back = XLSX.read(buf, { type: "array" })
    const s = back.Sheets[back.SheetNames[0]]
    // `raw: false` is what the wizard passes — it asks SheetJS for the FORMATTED string, not the underlying
    // number. Drop it and every numeric cell arrives as a JS number and every date as a serial integer.
    return { rows: XLSX.utils.sheet_to_json<Record<string, string>>(s, { defval: "", raw: false }) }
  }

  let csv = Papa.unparse({ fields: headers, data: table }, { newline: o.crlf ? "\r\n" : "\n" })
  if (o.bom) csv = "﻿" + csv
  const parsed = Papa.parse<Record<string, string>>(csv, {
    header: true, skipEmptyLines: true, comments: "#",
  })
  return { rows: parsed.data }
}

export const ALL_DIALECTS: DialectName[] = ["en-ZA", "af-ZA", "tpn", "payprop", "excel-numeric"]
