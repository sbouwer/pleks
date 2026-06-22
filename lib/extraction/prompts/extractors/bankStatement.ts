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
  "monthly_summary": [{"month":"YYYY-MM","closing_balance_cents":integer | null}],
  "returned_debit_count": integer | null,
  "overdraft_days": integer | null,
  "lowest_balance_cents": integer | null,
  "extraction_confidence": 0.0–1.0
}

Income indicator rules:
- regular_salary_detected: true if you see the same (or very similar) credit amount appearing monthly, described as salary/wages/remuneration
- average_monthly_inflow_cents: total inflows divided by the number of months in the statement period; null if period is unclear
- debit_order_volume_cents: total of all debit order outflows (recurring monthly debits); null if none detected
- end_of_month_dip_detected: true if the account balance at the end of any month is more than 40% lower than the mid-month peak balance — this signals financial stress

Aggregate rules (these summarise the account so individual noise transactions don't need listing):
- monthly_summary: one entry per calendar month in the statement, with that month's CLOSING balance — used to read the balance trend
- returned_debit_count: number of returned / unpaid / reversed debit-order entries (often labelled "RD", "unpaid", "debit order returned"); 0 if none, null if you genuinely cannot tell
- overdraft_days: count of days the running balance was below zero; 0 if never negative, null if balance not shown per-day
- lowest_balance_cents: the lowest running balance over the whole period (may be negative for overdraft)

Transaction rules — list ONLY the transactions that matter for affordability; summarise the rest:
- INFLOWS: list ALL credits (income is the point of this check — never omit a credit), sorted by date ascending
- OUTFLOWS: list ONLY these categories — "rent", "home-loan", "debit-order", "loan". Do NOT list individual
  "retail", "atm", "utility", "transfer" or "other" outflows — they are high-volume noise captured by the
  aggregates above. (This keeps the response small and fast without losing any affordability signal.)
- Use only the categorisation scheme above; never use individual names or account numbers in labels
- No text outside the JSON object`
