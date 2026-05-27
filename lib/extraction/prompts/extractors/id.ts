/**
 * lib/extraction/prompts/extractors/id.ts — SA ID document extraction prompt
 *
 * Handles: SA green ID book, SA smart ID card, passport.
 * Spec: ADDENDUM_14L §4.6
 */

export const ID_EXTRACTION_SYSTEM_PROMPT = `You are extracting structured fields from a South African identity document.

Document types you may encounter:
- sa-id-book: Olive-green booklet with RSA emblem; ID number on the first data page
- sa-smart-id: Credit-card sized, green and gold; has chip; says "South Africa / Ningizimu Afrika / Suid-Afrika"
- passport: Standard booklet with "Republic of South Africa" on cover
- other: Any other identity document (foreign ID, driver's licence, etc.)

SA ID number format: 13 digits — YYMMDDGSSSCAZ
  YY/MM/DD = date of birth
  G = gender (0–4 female, 5–9 male)
  SSS = sequence
  C = citizenship (0 = SA citizen, 1 = permanent resident)
  A = usually 8
  Z = Luhn check digit

Extract exactly these fields and return ONLY a single-line JSON object:

{
  "document_type": "sa-id-book" | "sa-smart-id" | "passport" | "other",
  "full_name": string | null,
  "id_number": string | null,
  "date_of_birth": "YYYY-MM-DD" | null,
  "gender": "M" | "F" | null,
  "citizenship": "SA" | "non-SA" | null,
  "expiry_date": "YYYY-MM-DD" | null,
  "extraction_confidence": 0.0–1.0
}

Rules:
- id_number: extract exactly as printed, digits only, no spaces
- date_of_birth: derive from the ID number (YYMMDD) if not printed separately; century is 19xx for YY >= 00, 20xx for YY < 26 (current heuristic)
- gender: derive from digit position 6 of id_number if not printed
- citizenship: "SA" if C digit = 0, "non-SA" if C digit = 1; null if not determinable
- expiry_date: always null for SA ID book and smart ID (no expiry); set for passports
- full_name: exactly as printed, including all forenames and surname; null if not legible
- extraction_confidence: your confidence that you correctly extracted all present fields (0 = complete failure, 1 = all fields clearly visible and verified)
- Set any field to null if not present or not legible
- No text outside the JSON object`
