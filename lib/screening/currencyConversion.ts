/**
 * Foreign currency display utilities for the screening flow.
 *
 * The actual income extraction (detecting foreign currency, setting
 * income_in_foreign_currency, income_currency_code, income_foreign_amount)
 * is handled by lib/screening/bankStatementExtraction.ts via the AI prompt.
 *
 * This module provides display formatting and agent-facing warnings.
 * Rates are NOT recalculated — they are snapshotted at extraction time
 * and stored on the application record.
 */

/** Currency symbols/names for common codes */
const CURRENCY_LABELS: Record<string, string> = {
  USD: "US Dollar",
  EUR: "Euro",
  GBP: "British Pound",
  CNY: "Chinese Yuan",
  ZWL: "Zimbabwe Dollar",
  BWP: "Botswana Pula",
  MZN: "Mozambican Metical",
  ZMW: "Zambian Kwacha",
  KES: "Kenyan Shilling",
  NGN: "Nigerian Naira",
  GHS: "Ghanaian Cedi",
  INR: "Indian Rupee",
  AUD: "Australian Dollar",
  CAD: "Canadian Dollar",
  JPY: "Japanese Yen",
}

/** Returns currency label or falls back to the ISO code */
export function getCurrencyLabel(code: string): string {
  return CURRENCY_LABELS[code.toUpperCase()] ?? code.toUpperCase()
}

/**
 * Formats a foreign income amount for agent display.
 *
 * Example output:
 *   "USD 3,200/month (~R58,400 at rate captured during extraction)"
 *
 * When zarEquivalent is null (rate not available), omits the ZAR portion.
 */
export function formatForeignIncome(
  foreignAmount: number,
  currencyCode: string,
  zarEquivalent: number | null
): string {
  const formatted = new Intl.NumberFormat("en-ZA", {
    style: "decimal",
    maximumFractionDigits: 0,
  }).format(foreignAmount)

  const label = `${currencyCode.toUpperCase()} ${formatted}/month`

  if (zarEquivalent != null) {
    const zarFormatted = new Intl.NumberFormat("en-ZA", {
      style: "currency",
      currency: "ZAR",
      maximumFractionDigits: 0,
    }).format(zarEquivalent)
    return `${label} (~${zarFormatted} at rate captured during extraction)`
  }

  return label
}

/**
 * Returns the standard agent-facing exchange rate warning.
 * Shown whenever income is in a foreign currency.
 */
export const EXCHANGE_RATE_WARNING =
  "Exchange rate risk — ZAR equivalent may change over the lease term. " +
  "Affordability should be assessed in the original currency where possible."

/**
 * Returns true if the income is considered assessable in ZAR
 * (i.e. ZAR income, or a ZAR equivalent was captured at extraction time).
 */
export function isZarAssessable(
  incomeInForeignCurrency: boolean,
  zarEquivalent: number | null
): boolean {
  return !incomeInForeignCurrency || zarEquivalent != null
}
