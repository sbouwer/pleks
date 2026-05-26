/**
 * lib/extraction/languageDetector.ts — Heuristic language detection from filenames/text
 *
 * Used as a fallback for documents rejected at upload (PSD, DOCX) where Claude can't classify.
 * For supported formats, Claude returns language as part of document type classification.
 *
 * Spec: ADDENDUM_14L §4.2
 */

const AFRIKAANS_TOKENS = [
  "Salarisspecificatie",
  "Betaalstrokie",
  "Vergoeding",
  "Afskrif",
  "Bewys van adres",
  "Werkgewer",
  "Netto betaling",
  "Bruto",
  "Aftrekkings",
  "Inkomste",
  "Maandelikse",
  "Bevestiging",
  "Bewys",
  "Betalings",
  "Loon",
]

const ENGLISH_TOKENS = [
  "Salary",
  "Payslip",
  "Bank Statement",
  "Employer",
  "Net Pay",
  "Gross",
  "Deductions",
  "Income",
  "Monthly",
  "Confirmation",
  "Reference",
  "Statement",
  "Letter",
  "Certificate",
]

export function detectLanguage(text: string): "en" | "af" | "mixed" | "unknown" {
  if (!text.trim()) return "unknown"

  let afScore = 0
  let enScore = 0

  for (const token of AFRIKAANS_TOKENS) {
    if (text.includes(token)) afScore++
  }
  for (const token of ENGLISH_TOKENS) {
    if (text.includes(token)) enScore++
  }

  if (afScore === 0 && enScore === 0) return "unknown"
  if (afScore > 0 && enScore > 0)     return "mixed"
  if (afScore > enScore)              return "af"
  return "en"
}
