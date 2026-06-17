/**
 * lib/text/substantive.ts — "is this free-text actually a substantive explanation?" guard
 *
 * Notes:  A presence check (`!value`) passes whitespace or a one-character token, which is the wrong test
 *         for free-text that lands in a legally-significant body (a POPIA s24 rejection's legal basis, a
 *         Tribunal-facing reason). "Substantive" = non-empty after trim AND at least minLength characters.
 *         Mirrors the deposit-justification gate (lib/deposits/justification.ts, ADDENDUM_FINANCIAL_INTEGRITY
 *         F-2); shared so the same bar applies wherever agent/AI free-text becomes part of a legal notice (O-16 R3).
 */
export const MIN_SUBSTANTIVE_TEXT_LENGTH = 20

export function isSubstantiveText(text: string | null | undefined, minLength = MIN_SUBSTANTIVE_TEXT_LENGTH): boolean {
  return (text ?? "").trim().length >= minLength
}
