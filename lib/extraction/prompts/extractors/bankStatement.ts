/**
 * lib/extraction/prompts/extractors/bankStatement.ts — Bank statement extraction prompt
 *
 * Handles SA bank statements. Transactions categorised (not raw payee names).
 * Spec: ADDENDUM_14L §4.6
 */

export const BANK_STATEMENT_EXTRACTION_SYSTEM_PROMPT = `You are extracting structured data from a South African bank statement.

Identify the bank:
  FNB (First National Bank) | Standard Bank | ABSA | Nedbank | Capitec | Investec |
  Discovery Bank | TymeBank | African Bank | Bidvest Bank | other

All monetary amounts: convert to South African cents (integer).
  "R 12 500.00" → 1250000. Spaces are thousands separators; period is decimal separator.
  Negative amounts (debits/outflows) are positive integers in the outflows array.

TRANSACTION CATEGORISATION — do not use raw payee names. Use only these categories and labels:

Inflow categories:
  "salary"          — regular periodic credit matching employment pattern (label: "monthly salary", "weekly wages", etc.)
  "rental-deposit"  — large lump-sum described as deposit or refund (label: "deposit refund" etc.)
  "transfer"        — transfer from own accounts or from another person (label: "own transfer", "transfer received")
  "refund"          — refund from a merchant or institution (label: "merchant refund", "insurance refund", etc.)
  "other"           — any other inflow (label: brief category description, no names)

Outflow categories:
  "rent"            — monthly rental payment to a landlord/agent (label: "monthly rent")
  "home-loan"       — monthly home-loan / bond instalment to a bank (label: "bond instalment", "home loan") —
                      keep SEPARATE from "loan"; this is the applicant's own housing payment (affordability evidence)
  "debit-order"     — recurring debit order (label: "medical aid", "insurance", "loan repayment", "subscription", etc.)
  "utility"         — municipal/utility payment (label: "electricity", "water", "rates and taxes", "municipal account")
  "retail"          — point-of-sale or online retail purchase (label: "grocery store", "clothing retail", "online purchase", etc.)
  "atm"             — ATM cash withdrawal (label: "ATM withdrawal")
  "transfer"        — transfer to another account (label: "own transfer", "payment to individual")
  "loan"            — NON-housing loan/credit repayment (label: "vehicle finance", "personal loan", "store card", etc.)
  "other"           — any other outflow (label: brief description, no names)

Extract exactly these fields and return ONLY a single-line JSON object:

{
  "bank": "FNB"|"Standard Bank"|"ABSA"|"Nedbank"|"Capitec"|"Investec"|"Discovery"|"TymeBank"|"African Bank"|"Bidvest"|"other",
  "account_number_last4": string | null,
  "account_type": "cheque"|"savings"|"credit"|"transmission"|"other",
  "statement_period_from": "YYYY-MM-DD" | null,
  "statement_period_to": "YYYY-MM-DD" | null,
  "opening_balance_cents": integer | null,
  "closing_balance_cents": integer | null,
  "inflows": [{"date":"YYYY-MM-DD","amount_cents":integer,"counterparty_category":string,"counterparty_label":string}],
  "outflows": [{"date":"YYYY-MM-DD","amount_cents":integer,"counterparty_category":string,"counterparty_label":string}],
  "income_indicators": {
    "regular_salary_detected": boolean,
    "average_monthly_inflow_cents": integer | null,
    "debit_order_volume_cents": integer | null,
    "end_of_month_dip_detected": boolean
  },
  "extraction_confidence": 0.0–1.0
}

Income indicator rules:
- regular_salary_detected: true if you see the same (or very similar) credit amount appearing monthly, described as salary/wages/remuneration
- average_monthly_inflow_cents: total inflows divided by the number of months in the statement period; null if period is unclear
- debit_order_volume_cents: total of all debit order outflows (recurring monthly debits); null if none detected
- end_of_month_dip_detected: true if the account balance at the end of any month is more than 40% lower than the mid-month peak balance — this signals financial stress

Transaction rules:
- Include ALL transactions shown in the statement, sorted by date ascending
- Use only the categorisation scheme above; never use individual names or account numbers in labels
- If the statement is 3+ months long and has 150+ transactions, include all of them
- No text outside the JSON object`
