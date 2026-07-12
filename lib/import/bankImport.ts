/**
 * lib/import/bankImport.ts — bank-account import helper: branch-code normalisation
 *
 * Notes:  hashBankAccount/maskBankAccount USED to live here with DIFFERENT outputs to the ones in
 *         lib/crypto/bankAccount.ts (unsalted digest; "****1234" vs "••••1234"). Two same-named functions
 *         producing different values is a trap: the next caller to import from the file literally named for
 *         bank import would write a hash that could never match a stored one. Deleted — lib/crypto/bankAccount
 *         is the SSOT for masking, hashing and encryption.
 */

export function normaliseBranchCode(raw: string | null): string | null {
  if (!raw) return null
  const match = /\((\d+)\)/.exec(raw)
  if (match) return match[1]
  if (/^\d+$/.test(raw.trim())) return raw.trim()
  return raw
}
