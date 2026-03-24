/**
 * Masks a bank account number for display.
 * Shows last 4 digits only: "6241234567" → "••••••4567"
 */
export function maskBankAccount(accountNumber: string): string {
  if (!accountNumber) return "—"
  const clean = accountNumber.replace(/\s/g, "")
  if (clean.length <= 4) return "••••"
  return `${"•".repeat(clean.length - 4)}${clean.slice(-4)}`
}
