/**
 * lib/deposits/justification.ts — what counts as a valid deduction justification (ADDENDUM_FINANCIAL_INTEGRITY F-2)
 *
 * A Rental Housing Tribunal (RHA s5) requires each deduction identified WITH a reason. A blank field — or one of
 * the auto-placeholders the old generateJustification wrote on the no-AI/no-key/error paths — is the ABSENCE of a
 * reason, so "not null" is the wrong test. Valid = non-empty + substantive (min length) + not a known placeholder.
 * Used by the confirm gate (app) + mirrored by the DB trigger (durable). Keep the placeholder set in sync if any
 * legacy placeholder strings resurface.
 */
export const MIN_JUSTIFICATION_LENGTH = 20

/** Legacy auto-placeholders that must NOT satisfy the gate (generateJustification no longer writes these). */
export const JUSTIFICATION_PLACEHOLDERS: readonly string[] = [
  "AI justification available on Steward tier and above.",
  "AI justification unavailable — Anthropic API key not configured.",
  "AI justification temporarily unavailable — please add manually.",
]

export function isValidJustification(text: string | null | undefined): boolean {
  const t = (text ?? "").trim()
  if (t.length < MIN_JUSTIFICATION_LENGTH) return false
  if (t.startsWith("AI justification ")) return false              // belt-and-braces: every legacy placeholder begins thus
  if (JUSTIFICATION_PLACEHOLDERS.includes(t)) return false
  return true
}
