/**
 * QIF (Quicken Interchange Format) parser.
 * Used by Capitec and some other SA banks.
 *
 * QIF format:
 * !Type:Bank
 * D03/04/2026        ← date
 * T-7200.00          ← amount (negative = debit for bank exports)
 * PPayee name        ← payee / description
 * MReference memo    ← memo / reference
 * ^                  ← record separator
 */

import type { ParsedTransaction } from "./ofxParser"

export interface QIFParseResult {
  transactions: ParsedTransaction[]
  error?: string
}

function parseQIFDate(raw: string): string {
  // Common formats: DD/MM/YYYY, DD-MM-YYYY, MM/DD/YYYY, YYYY-MM-DD
  const clean = raw.trim().replaceAll("-", "/")
  const parts = clean.split("/")
  if (parts.length === 3) {
    const [a, b, c] = parts
    if (c.length === 4) {
      // DD/MM/YYYY
      return `${c}-${b.padStart(2, "0")}-${a.padStart(2, "0")}`
    }
    if (a.length === 4) {
      // YYYY/MM/DD
      return `${a}-${b.padStart(2, "0")}-${c.padStart(2, "0")}`
    }
  }
  return raw
}

function cleanDescription(raw: string): string {
  return raw
    .replaceAll(/\s+/g, " ")
    .replaceAll(/[^\w\s.,&()/-]/g, "")
    .trim()
    .toUpperCase()
}

let qifCounter = 0

export function parseQIF(raw: string): QIFParseResult {
  try {
    const lines = raw.replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n")
    const transactions: ParsedTransaction[] = []

    let date = ""
    let amount = 0
    let payee = ""
    let memo = ""

    function flush() {
      if (!date || amount === 0) return
      const direction: "credit" | "debit" = amount >= 0 ? "credit" : "debit"
      const amountCents = Math.round(Math.abs(amount) * 100)
      const signedCents = direction === "credit" ? amountCents : -amountCents
      const descriptionRaw = payee || memo
      const referenceRaw = memo || payee
      // QIF has no FITID — build a synthetic one from date+amount+sequence
      qifCounter++
      transactions.push({
        externalId: `QIF-${date}-${signedCents}-${qifCounter}`,
        date,
        amountCents: signedCents,
        direction,
        descriptionRaw,
        referenceRaw,
        descriptionClean: cleanDescription(descriptionRaw),
        referenceClean: cleanDescription(referenceRaw),
      })
      date = ""; amount = 0; payee = ""; memo = ""
    }

    for (const line of lines) {
      const code = line[0]
      const value = line.slice(1).trim()
      if (code === "!" || code === undefined || line.trim() === "") continue
      switch (code) {
        case "D": date = parseQIFDate(value); break
        case "T": amount = parseFloat(value.replaceAll(",", "")); break
        case "U": if (!amount) amount = parseFloat(value.replaceAll(",", "")); break
        case "P": payee = value; break
        case "M": memo = value; break
        case "C": break // cleared flag — not used
        case "^": flush(); break
      }
    }
    flush() // last record if no trailing ^

    return { transactions }
  } catch (err) {
    return { transactions: [], error: String(err) }
  }
}
