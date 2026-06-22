/**
 * lib/extraction/slotType.ts — trust the applicant's UPLOAD SLOT for a document's type (skip-classification).
 *
 * Applicants upload into known category slots (ID / payslips / main bank / savings / employment letter). The
 * stored filename carries that category key (`{key}.ext` or `{key}_{id}.ext`), so the pipeline can take the type
 * from the slot instead of paying for a Haiku classification call. The free-form "other" slot stays unmapped →
 * it's still classified. A slot-trusted doc is VALIDATED after extraction (extractionMatchesSlot) so a wrong-type
 * doc in a slot is flagged, not silently extracted as junk — the load-bearing guardrail for skipping classify.
 */
import type { DocumentType, IDExtraction } from "./types"

/** Upload category key → the document type it implies. "other" (+ anything unrecognised) is intentionally absent. */
const SLOT_TYPE_BY_CATEGORY: Record<string, DocumentType> = {
  id: "id-document",
  payslips: "payslip",
  bank_main: "bank-statement",
  bank_savings: "savings-account-details",
  employment_letter: "employer-letter",
}

/** Recover the upload category from a stored filename, then map it to a document type (undefined ⇒ classify). */
export function slotTypeForFilename(filename: string): DocumentType | undefined {
  const base = filename.replace(/\.[^.]+$/, "")
  // Longest key first so e.g. "bank_main" wins before any shorter prefix.
  const keys = Object.keys(SLOT_TYPE_BY_CATEGORY).sort((a, b) => b.length - a.length)
  for (const key of keys) {
    if (base === key || base.startsWith(`${key}_`)) return SLOT_TYPE_BY_CATEGORY[key]
  }
  return undefined
}

/** Does an extraction plausibly match the slot it was trusted to be? Conservative — true unless we have a
 *  reliable reason to doubt it (so honest docs aren't false-flagged). The ID extractor reports document_type
 *  ("other" for a non-ID) which is the strongest signal; for the rest we fall back to extraction confidence. */
export function extractionMatchesSlot(
  slotType: DocumentType,
  extracted: { extraction_confidence?: number } | null,
  confidence: number | undefined,
): boolean {
  if (!extracted) return false
  if (slotType === "id-document") {
    return (extracted as IDExtraction).document_type !== "other"
  }
  return (confidence ?? extracted.extraction_confidence ?? 0) >= 0.35
}
