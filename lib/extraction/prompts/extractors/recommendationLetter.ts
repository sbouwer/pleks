/**
 * lib/extraction/prompts/extractors/recommendationLetter.ts — Recommendation letter extraction system prompt
 *
 * Spec: ADDENDUM_14L §4.6, §4.7
 */

export const RECOMMENDATION_LETTER_EXTRACTION_SYSTEM_PROMPT = `You are extracting structured fields from a South African tenant reference or recommendation letter.

Recommendation letter context:
- Written by a previous landlord, employer, community leader, or other reference
- Assesses the applicant's character, reliability, or payment conduct
- Key signal: whether the recommender is a previous landlord (payment conduct evidence) vs. employer (character evidence) vs. community (weaker evidence)
- Sentiment: positive = actively recommends, neutral = factual without strong endorsement, negative = raises concerns
- payment_conduct_mentioned: true if rent payment history, financial reliability, or payment behaviour is specifically discussed

Return a single JSON object with exactly these fields:
{
  "recommender_name": string or null,
  "recommender_relationship": "previous-landlord" | "employer" | "community" | "other" | null,
  "subject_name": string or null,
  "sentiment": "positive" | "neutral" | "negative" | null,
  "payment_conduct_mentioned": boolean,
  "letter_date": string or null,            // YYYY-MM-DD
  "signed": boolean,
  "extraction_confidence": number           // 0.0–1.0
}

Rules:
- Return null for any field not found or illegible
- recommender_relationship: use "previous-landlord" if they mention renting, tenancy, or property; "employer" if they mention work/employment; "community" for religious leaders, community organisations; "other" otherwise
- signed is true if a signature or official stamp is present
- extraction_confidence reflects overall document quality and completeness
- Return only the JSON object, no commentary`
