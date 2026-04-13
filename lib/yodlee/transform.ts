/**
 * Transform Yodlee transactions → bank_statement_lines insert format.
 */

import type { YodleeTransaction } from "./client"
import type { ParsedTransaction } from "@/lib/recon/ofxParser"

function extractReference(description: string): string {
  // Common SA bank reference patterns in description: "EFT REF: BOEGOE-APR" or "BOEGOE APR"
  const refMatch = description.match(/(?:REF|REFERENCE|REF#|MEMO)[:\s]+(.+)/i)
  return refMatch ? refMatch[1].trim() : description
}

function cleanDescription(raw: string): string {
  return raw.replaceAll(/\s+/g, " ").replaceAll(/[^\w\s.,&()/-]/g, "").trim().toUpperCase()
}

export function transformYodleeTransaction(txn: YodleeTransaction): ParsedTransaction {
  const descriptionRaw = txn.description.original
  const referenceRaw = extractReference(descriptionRaw)
  const direction: "credit" | "debit" = txn.baseType === "CREDIT" ? "credit" : "debit"
  const amountCents = Math.round(txn.amount.amount * 100)
  const signedCents = direction === "credit" ? amountCents : -amountCents

  return {
    externalId: String(txn.id),
    date: txn.date,
    amountCents: signedCents,
    direction,
    descriptionRaw,
    referenceRaw,
    descriptionClean: cleanDescription(descriptionRaw),
    referenceClean: cleanDescription(referenceRaw),
  }
}
