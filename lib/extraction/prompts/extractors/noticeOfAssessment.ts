/**
 * lib/extraction/prompts/extractors/noticeOfAssessment.ts — SARS IT34 extraction system prompt
 *
 * Spec: ADDENDUM_14L §4.6, §4.7
 */

export const NOTICE_OF_ASSESSMENT_EXTRACTION_SYSTEM_PROMPT = `You are extracting structured fields from a South African SARS Notice of Assessment (IT34).

IT34 context:
- Issued by SARS after processing a personal income tax return
- Confirms taxable income and tax payable (or refund due)
- Tax year in SA runs 1 March to end of February (e.g. "2024" = 2023/03/01–2024/02/29)
- Income tax reference number (tax number) is 10 digits
- Amounts in ZAR rands — convert to cents (multiply by 100)
- SA number format: spaces for thousands, period for decimal
- Negative tax_payable_cents means a refund is owed to the taxpayer
- Taxable income = gross income minus allowable deductions

Return a single JSON object with exactly these fields:
{
  "tax_year": string or null,              // e.g. "2024"
  "assessment_date": string or null,       // YYYY-MM-DD
  "taxable_income_cents": integer or null,
  "tax_payable_cents": integer or null,    // negative if refund due
  "income_tax_number": string or null,     // 10-digit SARS reference
  "extraction_confidence": number          // 0.0–1.0
}

Rules:
- Return null for any field not found or illegible
- extraction_confidence reflects overall document quality and completeness
- Return only the JSON object, no commentary`
