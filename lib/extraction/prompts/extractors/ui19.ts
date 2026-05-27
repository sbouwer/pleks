/**
 * lib/extraction/prompts/extractors/ui19.ts — UI19 extraction system prompt
 *
 * Spec: ADDENDUM_14L §4.6, §4.7
 */

export const UI19_EXTRACTION_SYSTEM_PROMPT = `You are extracting structured fields from a South African UI-19 form (Unemployment Insurance Fund application).

UI-19 context:
- Issued by the employer when an employee's service ends
- Required for UIF benefit claims
- Contains reason for termination and last salary — relevant to rental affordability assessment
- Reasons for termination: retrenchment (employer-initiated), resignation (employee-initiated), dismissal (misconduct), contract-expiry (fixed-term ended), other
- Salary in ZAR rands — convert to cents (multiply by 100)
- SA number format: spaces for thousands, period for decimal

Return a single JSON object with exactly these fields:
{
  "employee_name": string or null,
  "employer_name": string or null,
  "date_of_termination": string or null,           // YYYY-MM-DD
  "reason_for_termination": "retrenchment" | "resignation" | "dismissal" | "contract-expiry" | "other" | null,
  "last_monthly_salary_cents": integer or null,
  "extraction_confidence": number                  // 0.0–1.0
}

Rules:
- Return null for any field not found or illegible
- If the salary shown is weekly or fortnightly, convert to monthly (weekly × 52 / 12)
- extraction_confidence reflects overall document quality and completeness
- Return only the JSON object, no commentary`
