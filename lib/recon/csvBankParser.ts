/**
 * Bank-specific CSV parser for SA banks.
 * Each SA bank exports CSV with different column names and date formats.
 * We detect the bank from column headers, then parse accordingly.
 */

import Papa from "papaparse"
import type { ParsedTransaction } from "./ofxParser"

type SABank = "fnb" | "absa" | "standard_bank" | "nedbank" | "capitec" | "investec" | "unknown"

interface BankCSVConfig {
  bank: SABank
  detectHeaders: string[]        // subset that must all be present
  dateColumn: string
  dateFormat: "DD/MM/YYYY" | "YYYY/MM/DD" | "YYYY-MM-DD" | "DD-MM-YYYY"
  descriptionColumn: string
  referenceColumn: string | null // null = reference embedded in description
  amountColumn: string | null    // single signed column
  debitColumn: string | null     // separate debit (always positive)
  creditColumn: string | null    // separate credit (always positive)
  balanceColumn: string | null
}

const BANK_CSV_CONFIGS: BankCSVConfig[] = [
  {
    bank: "fnb",
    detectHeaders: ["Date", "Description 1", "Description 2", "Amount"],
    dateColumn: "Date",
    dateFormat: "DD/MM/YYYY",
    descriptionColumn: "Description 1",
    referenceColumn: "Description 2",
    amountColumn: "Amount",
    debitColumn: null,
    creditColumn: null,
    balanceColumn: "Balance",
  },
  {
    bank: "absa",
    detectHeaders: ["Date", "Reference No", "Description", "Amount"],
    dateColumn: "Date",
    dateFormat: "YYYY/MM/DD",
    descriptionColumn: "Description",
    referenceColumn: "Reference No",
    amountColumn: "Amount",
    debitColumn: null,
    creditColumn: null,
    balanceColumn: "Balance",
  },
  {
    bank: "standard_bank",
    detectHeaders: ["Date", "Description", "Debit", "Credit", "Balance"],
    dateColumn: "Date",
    dateFormat: "DD/MM/YYYY",
    descriptionColumn: "Description",
    referenceColumn: null,
    amountColumn: null,
    debitColumn: "Debit",
    creditColumn: "Credit",
    balanceColumn: "Balance",
  },
  {
    bank: "nedbank",
    detectHeaders: ["Date", "Transaction Description", "Debit Amount", "Credit Amount"],
    dateColumn: "Date",
    dateFormat: "YYYY-MM-DD",
    descriptionColumn: "Transaction Description",
    referenceColumn: null,
    amountColumn: null,
    debitColumn: "Debit Amount",
    creditColumn: "Credit Amount",
    balanceColumn: "Balance",
  },
  {
    bank: "capitec",
    detectHeaders: ["Date", "Description", "Amount", "Balance", "Category"],
    dateColumn: "Date",
    dateFormat: "DD/MM/YYYY",
    descriptionColumn: "Description",
    referenceColumn: null,
    amountColumn: "Amount",
    debitColumn: null,
    creditColumn: null,
    balanceColumn: "Balance",
  },
  {
    bank: "investec",
    detectHeaders: ["Transaction Date", "Description", "Debit", "Credit", "Balance"],
    dateColumn: "Transaction Date",
    dateFormat: "DD/MM/YYYY",
    descriptionColumn: "Description",
    referenceColumn: null,
    amountColumn: null,
    debitColumn: "Debit",
    creditColumn: "Credit",
    balanceColumn: "Balance",
  },
]

export interface CSVParseResult {
  transactions: ParsedTransaction[]
  detectedBank: SABank
  error?: string
}

function parseDate(raw: string, fmt: BankCSVConfig["dateFormat"]): string {
  const clean = raw.trim().replaceAll("-", "/")
  const parts = clean.split("/")
  if (parts.length !== 3) return raw
  const [a, b, c] = parts
  if (fmt === "DD/MM/YYYY" || fmt === "DD-MM-YYYY") {
    return `${c}-${b.padStart(2, "0")}-${a.padStart(2, "0")}`
  }
  if (fmt === "YYYY/MM/DD" || fmt === "YYYY-MM-DD") {
    return `${a}-${b.padStart(2, "0")}-${c.padStart(2, "0")}`
  }
  return raw
}

function parseAmount(raw: string | undefined | null): number {
  if (!raw) return 0
  return parseFloat(raw.toString().replaceAll(/[, R]/g, "")) || 0
}

function cleanDescription(raw: string): string {
  return raw.replaceAll(/\s+/g, " ").replaceAll(/[^\w\s.,&()/-]/g, "").trim().toUpperCase()
}

function detectBank(headers: string[]): BankCSVConfig | null {
  const headerSet = new Set(headers.map((h) => h.trim()))
  for (const config of BANK_CSV_CONFIGS) {
    if (config.detectHeaders.every((h) => headerSet.has(h))) {
      return config
    }
  }
  return null
}

let csvCounter = 0

export function parseCSVBank(csvText: string): CSVParseResult {
  try {
    const parsed = Papa.parse<Record<string, string>>(csvText, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
    })

    if (parsed.errors.length > 0 && parsed.data.length === 0) {
      return { transactions: [], detectedBank: "unknown", error: parsed.errors[0].message }
    }

    const headers = parsed.meta.fields ?? []
    const config = detectBank(headers)

    if (!config) {
      return {
        transactions: [],
        detectedBank: "unknown",
        error: "Could not detect bank format from column headers",
      }
    }

    const transactions: ParsedTransaction[] = []

    for (const row of parsed.data) {
      const rawDate = row[config.dateColumn]
      if (!rawDate?.trim()) continue

      const date = parseDate(rawDate, config.dateFormat)
      const descriptionRaw = row[config.descriptionColumn] ?? ""
      const referenceRaw = config.referenceColumn ? (row[config.referenceColumn] ?? descriptionRaw) : descriptionRaw

      let amountCents: number
      let direction: "credit" | "debit"

      if (config.amountColumn) {
        const amt = parseAmount(row[config.amountColumn])
        direction = amt >= 0 ? "credit" : "debit"
        amountCents = Math.round(Math.abs(amt) * 100)
      } else {
        const debit = parseAmount(row[config.debitColumn ?? ""])
        const credit = parseAmount(row[config.creditColumn ?? ""])
        if (credit > 0) {
          direction = "credit"
          amountCents = Math.round(credit * 100)
        } else {
          direction = "debit"
          amountCents = Math.round(debit * 100)
        }
      }

      if (amountCents === 0) continue

      const signedCents = direction === "credit" ? amountCents : -amountCents
      csvCounter++

      transactions.push({
        externalId: `CSV-${config.bank}-${date}-${signedCents}-${csvCounter}`,
        date,
        amountCents: signedCents,
        direction,
        descriptionRaw,
        referenceRaw,
        descriptionClean: cleanDescription(descriptionRaw),
        referenceClean: cleanDescription(referenceRaw),
      })
    }

    return { transactions, detectedBank: config.bank }
  } catch (err) {
    return { transactions: [], detectedBank: "unknown", error: String(err) }
  }
}
