export const ADDITIONAL_DOC_PROMPTS: Record<string, string> = {
  savings_account: `Extract the current balance from this South African bank savings account statement. Return JSON:
{ "balance_cents": integer or null, "account_type": "savings", "bank_name": string or null, "confidence": 0.0-1.0 }`,

  investment_portfolio: `Extract the total investment value from this South African investment or unit trust portfolio statement. Return JSON:
{ "portfolio_value_cents": integer or null, "provider": string or null, "as_at_date": "YYYY-MM-DD" or null, "confidence": 0.0-1.0 }`,

  pension_statement: `Extract the monthly pension/annuity amount from this statement. Return JSON:
{ "monthly_amount_cents": integer or null, "annual_amount_cents": integer or null, "provider": string or null, "confidence": 0.0-1.0 }`,

  other_income: `Extract any income or balance amounts from this document. Return JSON:
{ "description": string, "amount_cents": integer or null, "is_monthly": boolean, "confidence": 0.0-1.0 }`,

  trust_income: `Extract trust distribution or income amounts from this document. Return JSON:
{ "distribution_amount_cents": integer or null, "frequency": "monthly|quarterly|annual|once_off", "trust_name": string or null, "confidence": 0.0-1.0 }`,

  rental_income: `Extract rental income from this document (may be a lease agreement, bank statement, or rental receipt). Return JSON:
{ "monthly_rental_income_cents": integer or null, "property_description": string or null, "confidence": 0.0-1.0 }`,
}

export function getExtractionPrompt(docType: string): string {
  return ADDITIONAL_DOC_PROMPTS[docType] ?? ADDITIONAL_DOC_PROMPTS.other_income
}
