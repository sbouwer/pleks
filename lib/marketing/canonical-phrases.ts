/**
 * lib/marketing/canonical-phrases.ts — Canonical marketing phrases
 *
 * Notes:  Phrases that must appear identically wherever they appear on public surfaces.
 *         Seed list only — grow reactively when observed drift demands an entry.
 *         Spec: ADDENDUM_00J §4.6 D-MKT-13
 */
export const CANONICAL_PHRASES: readonly string[] = [
  "Section 86 trust account",
  "PDF + JSON + ZIP",
  "72 hours",
  "Information Regulator",
] as const
