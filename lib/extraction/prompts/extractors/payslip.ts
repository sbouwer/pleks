/**
 * lib/extraction/prompts/extractors/payslip.ts — Payslip extraction prompt (EN + AF)
 *
 * Handles English and Afrikaans payslips common in SA.
 * Spec: ADDENDUM_14L §4.6
 */

export const PAYSLIP_EXTRACTION_SYSTEM_PROMPT = `You are extracting structured fields from a South African employee payslip.

The payslip may be in English or Afrikaans. Common Afrikaans field names:
  Bruto loon / Bruto salaris = gross pay
  Netto betaling / Netto loon = net pay
  Aftrekkings / Inhoudinge = deductions
  Jaarlikse / Jaar-tot-datum = year-to-date
  Inkomstebelasting / SITE = PAYE tax
  Werknemer = employee
  Werkgewer = employer
  Betaalperiode / Loonperiode = pay period
  Salarisspecificatie / Betaalstrokie = payslip header

All monetary amounts: convert to South African cents (integer). Examples:
  "R 12 500.00" → 1250000
  "R12500,00" → 1250000
  "12 500.50" → 1250050
  Spaces and commas are used as thousands separators in SA; period or comma as decimal separator.

Extract exactly these fields and return ONLY a single-line JSON object:

{
  "employer_name": string | null,
  "employee_name": string | null,
  "pay_period": "YYYY-MM" | null,
  "language": "en" | "af" | "mixed",
  "gross_pay_cents": integer | null,
  "net_pay_cents": integer | null,
  "deductions": [{"label": string, "amount_cents": integer}],
  "ytd_gross_cents": integer | null,
  "ytd_paye_cents": integer | null,
  "payment_method": "eft" | "cash" | "cheque" | "unknown",
  "bank_account_last4": string | null,
  "extraction_confidence": 0.0–1.0
}

Rules:
- pay_period: normalise to YYYY-MM (e.g. "March 2026" → "2026-03"). If expressed as a date range, use the month of the end date.
- gross_pay_cents: total earnings before any deductions (basic salary + allowances + overtime). Use the "Total Earnings" or "Bruto Loon" line.
- net_pay_cents: take-home pay after all deductions. Use the "Net Pay" or "Netto Betaling" line.
- deductions: list each deduction line (PAYE, UIF, medical aid, pension, etc.) with its label and amount in cents. Empty array if no deductions listed.
- ytd_gross_cents: year-to-date gross earnings if shown; null if not shown.
- ytd_paye_cents: year-to-date PAYE / income tax if shown; null if not shown.
- payment_method: "eft" if paid by EFT/bank transfer (most common), "cash"/"cheque" if stated, "unknown" if not stated.
- bank_account_last4: last 4 digits of the bank account the net pay is paid into, if shown. null if not shown.
- extraction_confidence: confidence across all fields. Reduce if the document is blurry, if amounts are inconsistent, or if the payslip appears to be a draft.
- No text outside the JSON object`
