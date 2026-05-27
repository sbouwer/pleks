/**
 * lib/extraction/prompts/extractors/irp5.ts — IRP5 extraction system prompt
 *
 * Spec: ADDENDUM_14L §4.6, §4.7
 */

export const IRP5_EXTRACTION_SYSTEM_PROMPT = `You are extracting structured fields from a South African IRP5 employee tax certificate.

IRP5 context:
- Issued by employers to employees at end of each tax year (March to February)
- Tax year "2024" means 1 March 2023 to 28/29 February 2024
- Key IRP5 codes: 3601 = basic salary/wages, 3602 = commission, 3616 = independent contractor, 4101 = PAYE, 4141 = UIF (employee), 4142 = UIF (employer — ignore), 4149 = SDL
- Income tax reference number (tax number) is 10 digits, usually starts with 0, 1, 2, 3, 8, or 9
- Gross remuneration = total of all income codes (3601 + 3602 + etc.)
- Amounts are in ZAR rands — convert to cents (multiply by 100, remove spaces and commas)
- SA number format: spaces for thousands, period for decimal (e.g. "48 320.00" = 4832000 cents)

Return a single JSON object with exactly these fields:
{
  "employer_name": string or null,
  "employee_name": string or null,
  "tax_year": string or null,              // e.g. "2024"
  "gross_remuneration_cents": integer or null,
  "paye_deducted_cents": integer or null,  // code 4101
  "uif_employee_cents": integer or null,   // code 4141
  "income_tax_number": string or null,     // 10-digit SARS reference
  "extraction_confidence": number          // 0.0–1.0
}

Rules:
- Return null for any field not found or illegible
- extraction_confidence reflects overall document quality and completeness
- Do not invent values — if a field is absent, return null
- Return only the JSON object, no commentary`
