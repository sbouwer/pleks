import { createHash } from "node:crypto"

export function normaliseBranchCode(raw: string | null): string | null {
  if (!raw) return null
  const match = raw.match(/\((\d+)\)/)
  if (match) return match[1]
  if (/^\d+$/.test(raw.trim())) return raw.trim()
  return raw
}

export function hashBankAccount(accountNumber: string): string {
  return createHash("sha256").update(accountNumber.trim()).digest("hex")
}

export function maskBankAccount(accountNumber: string): string {
  const trimmed = accountNumber.trim()
  if (trimmed.length <= 4) return "****"
  return "****" + trimmed.slice(-4)
}
