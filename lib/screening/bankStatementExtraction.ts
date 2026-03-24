export const INCOME_EXTRACTION_PROMPT = `You are extracting income and affordability data from a South African applicant's bank statement for a rental pre-screening.

Focus on:
- Regular income credits (salary, freelance income, business income, rental income)
- Average gross monthly income over the statement period
- Income consistency (is it regular or erratic?)
- Red flags: bounced debit orders, frequent overdraft, garnishee orders

Do NOT comment on spending habits, personal choices, or lifestyle.
Do NOT make character judgements.

If income is in a foreign currency:
- Identify the currency (USD, EUR, GBP, CNY, etc.)
- Return the original amount in that currency
- Do NOT convert to ZAR
- Set income_currency to the ISO code
- Set avg_monthly_income_cents to null
- Set income_in_foreign_currency to true

Return ONLY valid JSON:
{
  "avg_monthly_income_cents": integer or null,
  "months_analysed": integer,
  "income_type": "salary|freelance|business|mixed|unclear",
  "income_consistency": 0.0 to 1.0,
  "salary_detected": boolean,
  "regular_credit_amounts": [list of regular amounts in cents],
  "bounced_debit_orders": integer,
  "overdraft_occurrences": integer,
  "garnishee_detected": boolean,
  "red_flags": ["list any concerns — factual only, no judgements"],
  "confidence": 0.0 to 1.0,
  "notes": "any extraction uncertainty",
  "income_in_foreign_currency": boolean,
  "income_currency_code": "ZAR" or ISO code,
  "income_foreign_amount": number or null
}`

export interface BankStatementExtraction {
  avg_monthly_income_cents: number | null
  months_analysed: number
  income_type: string
  income_consistency: number
  salary_detected: boolean
  bounced_debit_orders: number
  overdraft_occurrences: number
  garnishee_detected: boolean
  red_flags: string[]
  confidence: number
  notes: string
  income_in_foreign_currency: boolean
  income_currency_code: string
  income_foreign_amount: number | null
}
