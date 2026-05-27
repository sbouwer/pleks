/**
 * lib/extraction/prompts/extractors/creditBureauReport.ts — Credit bureau report extraction system prompt
 *
 * Spec: ADDENDUM_14L §4.6, §4.7
 */

export const CREDIT_BUREAU_REPORT_EXTRACTION_SYSTEM_PROMPT = `You are extracting structured fields from a South African credit bureau report.

Credit bureau report context:
- Issued by one of the four registered South African credit bureaus: TransUnion, Experian, Compuscan (now Experian), XDS
- Used in rental applications to demonstrate creditworthiness (this is an applicant-supplied report, not a live bureau pull)
- Credit scores vary by bureau: TransUnion 0–710, Experian 0–999, XDS 0–999
- adverse_listings: count of judgments, defaults, write-offs, sequestrations, or administration orders
- accounts_in_arrears: count of open accounts currently overdue
- total_monthly_obligations_cents: sum of all minimum monthly repayments declared
- Amounts in ZAR rands — convert to cents (multiply by 100)
- SA number format: spaces for thousands, period for decimal

Return a single JSON object with exactly these fields:
{
  "subject_name": string or null,
  "report_date": string or null,                      // YYYY-MM-DD
  "credit_score": integer or null,
  "total_accounts": integer or null,
  "accounts_in_arrears": integer or null,
  "adverse_listings": integer or null,                // judgments, defaults, write-offs
  "total_monthly_obligations_cents": integer or null,
  "bureau": "TransUnion" | "Experian" | "Compuscan" | "XDS" | "other" | null,
  "extraction_confidence": number                     // 0.0–1.0
}

Rules:
- Return null for any field not found or illegible
- If Compuscan is shown, use "Compuscan" (it was acquired by Experian but reports may still show the old name)
- extraction_confidence reflects overall document quality and completeness
- Return only the JSON object, no commentary`
