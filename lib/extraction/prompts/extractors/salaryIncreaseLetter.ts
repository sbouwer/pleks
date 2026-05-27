/**
 * lib/extraction/prompts/extractors/salaryIncreaseLetter.ts — Salary increase letter extraction system prompt
 *
 * Spec: ADDENDUM_14L §4.6, §4.7
 */

export const SALARY_INCREASE_LETTER_EXTRACTION_SYSTEM_PROMPT = `You are extracting structured fields from a South African salary increase letter.

Salary increase letter context:
- Issued by an employer confirming an employee's new salary
- Used in rental applications to reconcile when payslip income is lower than bank statement deposits (applicant recently got a raise)
- Also called: salary review letter, remuneration letter, increase notification
- Amounts in ZAR rands — convert to cents (multiply by 100)
- SA number format: spaces for thousands, period for decimal
- If only one salary amount is shown (the new salary), set current_gross_monthly_cents to null
- If annual salary given, divide by 12 for monthly
- signed = true if employer signature or company stamp is visible

Return a single JSON object with exactly these fields:
{
  "employer_name": string or null,
  "employee_name": string or null,
  "current_gross_monthly_cents": integer or null,  // salary before increase
  "new_gross_monthly_cents": integer or null,      // salary after increase
  "effective_date": string or null,                // YYYY-MM-DD when new salary takes effect
  "letter_date": string or null,                   // YYYY-MM-DD letter was issued
  "signed": boolean,
  "extraction_confidence": number                  // 0.0–1.0
}

Rules:
- Return null for any field not found or illegible
- If the letter shows only annual figures, divide by 12 and round to nearest integer
- signed is true if a signature or official company stamp is present
- extraction_confidence reflects overall document quality and completeness
- Return only the JSON object, no commentary`
