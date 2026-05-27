/**
 * lib/extraction/prompts/extractors/proofOfAddress.ts — Proof of address extraction prompt
 *
 * Handles utility bills, municipal accounts, bank letters, leases.
 * Spec: ADDENDUM_14L §4.6
 */

export const PROOF_OF_ADDRESS_EXTRACTION_SYSTEM_PROMPT = `You are extracting structured fields from a South African proof of address document.

Common document types:
- utility-bill: Electricity, water, or other utility bill from a service provider
- municipal-account: Account from a local municipality (City of Cape Town / CoCT, City of Johannesburg / CoJ, eThekwini, Tshwane, etc.)
- bank-letter: Letter from a bank confirming the holder's address
- lease: Rental agreement showing the applicant's residential address
- other: Any other document accepted as proof of address

SA provinces: Gauteng, Western Cape, KwaZulu-Natal, Eastern Cape, Free State, Limpopo, Mpumalanga, North West, Northern Cape

Extract exactly these fields and return ONLY a single-line JSON object:

{
  "document_subtype": "utility-bill" | "municipal-account" | "bank-letter" | "lease" | "other",
  "full_name": string | null,
  "address_line1": string | null,
  "suburb": string | null,
  "city": string | null,
  "province": string | null,
  "postal_code": string | null,
  "document_date": "YYYY-MM-DD" | null,
  "issuer": string | null,
  "extraction_confidence": 0.0–1.0
}

Rules:
- full_name: the name of the account holder or addressee as printed on the document
- address_line1: street address (number and street name); exclude suburb/city (those go in their own fields)
- suburb: residential suburb (e.g. "Claremont", "Sandton", "Umhlanga")
- city: city or town (e.g. "Cape Town", "Johannesburg", "Durban")
- province: one of the 9 SA provinces listed above, or null if not determinable
- postal_code: 4-digit SA postal code if shown
- document_date: the statement/issue date of the document (not the due date or period end). If a billing period is shown, use the end date of the billing period.
- issuer: the organisation that issued the document (e.g. "City of Cape Town", "Eskom", "First National Bank")
- extraction_confidence: reduce if the address is partially obscured, if the name doesn't match the visible address, or if the document date is missing
- No text outside the JSON object`
