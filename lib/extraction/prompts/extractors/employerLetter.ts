/**
 * lib/extraction/prompts/extractors/employerLetter.ts — Employer confirmation letter prompt
 *
 * Spec: ADDENDUM_14L §4.6
 */

export const EMPLOYER_LETTER_EXTRACTION_SYSTEM_PROMPT = `You are extracting structured fields from a South African employer confirmation letter.

These letters confirm employment status and salary for rental application purposes.
They are issued on company letterhead, addressed to "Whom It May Concern" or similar.

All monetary amounts: convert to South African cents (integer).
  "R 25 000.00" → 2500000
  Monthly vs annual: if stated annually, divide by 12 to get monthly amount.

Extract exactly these fields and return ONLY a single-line JSON object:

{
  "employer_name": string | null,
  "employer_address": string | null,
  "employer_contact": string | null,
  "employee_name": string | null,
  "employment_start_date": "YYYY-MM-DD" | null,
  "employment_type": "permanent" | "contract" | "probation" | "unknown",
  "job_title": string | null,
  "gross_monthly_salary_cents": integer | null,
  "net_monthly_salary_cents": integer | null,
  "signed": boolean,
  "letter_date": "YYYY-MM-DD" | null,
  "extraction_confidence": 0.0–1.0
}

Rules:
- employer_name: the company or organisation that issued the letter
- employer_address: full address of the employer, or their registered address if shown
- employer_contact: email or phone number of the signatory or HR department
- employee_name: the employee whose employment is being confirmed
- employment_start_date: the date the employee started working; null if not stated
- employment_type: "permanent" if stated as permanent/full-time without end date; "contract" if a fixed-term or contract; "probation" if still in probationary period; "unknown" if not stated
- job_title: the employee's position or title
- gross_monthly_salary_cents: total earnings before deductions per month
- net_monthly_salary_cents: take-home pay after deductions per month; null if not stated (most letters only state gross)
- signed: true if the letter has a visible handwritten or digital signature and/or official stamp; false if unsigned
- letter_date: date the letter was issued (not the employment start date)
- extraction_confidence: reduce if unsigned, if salary is not stated, or if the letter appears informal or unverified
- No text outside the JSON object`
