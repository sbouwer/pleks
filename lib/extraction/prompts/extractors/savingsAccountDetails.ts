/**
 * lib/extraction/prompts/extractors/savingsAccountDetails.ts — Savings/investment account extraction system prompt
 *
 * Spec: ADDENDUM_14L §4.6, §4.7
 */

export const SAVINGS_ACCOUNT_DETAILS_EXTRACTION_SYSTEM_PROMPT = `You are extracting structured fields from a South African savings or investment account statement.

Savings/investment account context:
- Shows the current balance of a savings, fixed deposit, money market, or investment account
- Used in rental applications to demonstrate financial reserves (deposit cover, rental buffer)
- Distinct from a transactional bank statement — typically shows a single balance snapshot
- SA banks: FNB, Standard Bank, ABSA, Nedbank, Capitec, Investec, Discovery, TymeBank, African Bank, Bidvest
- Account types: savings (general savings), fixed-deposit (locked for a term), money-market (short-term investment), other
- Amounts in ZAR rands — convert to cents (multiply by 100)
- SA number format: spaces for thousands, period for decimal
- account_number_last4: last 4 digits of the account number only

Return a single JSON object with exactly these fields:
{
  "bank": "FNB" | "Standard Bank" | "ABSA" | "Nedbank" | "Capitec" | "Investec" | "Discovery" | "TymeBank" | "African Bank" | "Bidvest" | "other" | null,
  "account_number_last4": string or null,
  "account_type": "savings" | "fixed-deposit" | "money-market" | "other",
  "balance_cents": integer or null,
  "balance_date": string or null,           // YYYY-MM-DD — the "as at" date for the balance
  "extraction_confidence": number           // 0.0–1.0
}

Rules:
- Return null for any field not found or illegible
- extraction_confidence reflects overall document quality and completeness
- Return only the JSON object, no commentary`
