/**
 * lib/extraction/prompts/extractors/sarsVatReference.ts — SARS VAT registration certificate extraction system prompt
 *
 * Spec: ADDENDUM_14L §4.6, §4.7
 */

export const SARS_VAT_REFERENCE_EXTRACTION_SYSTEM_PROMPT = `You are extracting structured fields from a South African SARS VAT registration certificate or reference letter.

SARS VAT reference context:
- A certificate issued by SARS confirming a business is registered for VAT
- Relevant in commercial rental applications to confirm the applicant entity is a legitimate trading business
- VAT registration number is a 10-digit number starting with 4
- The registered entity is typically a company (Pty Ltd, CC, sole proprietor, or trust)

Return a single JSON object with exactly these fields:
{
  "entity_name": string or null,
  "vat_number": string or null,          // 10-digit VAT registration number
  "registration_date": string or null,   // YYYY-MM-DD
  "extraction_confidence": number        // 0.0–1.0
}

Rules:
- Return null for any field not found or illegible
- extraction_confidence reflects overall document quality and completeness
- Return only the JSON object, no commentary`
