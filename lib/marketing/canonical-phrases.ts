/**
 * lib/marketing/canonical-phrases.ts — Canonical marketing phrases
 *
 * Notes:  Phrases that must appear identically wherever they appear on public surfaces.
 *         Seed list only — grow reactively when observed drift demands an entry.
 *         Spec: ADDENDUM_00J §4.6 D-MKT-13
 */
export const CANONICAL_PHRASES: readonly string[] = [
  // PPA 22 of 2019 s54 is the trust-account provision; the Act ends at s77. "Section 86" was published
  // across 11 sites until 2026-08-14 (the bleed is Legal Practice Act 28 of 2014 s86, the ATTORNEYS'
  // trust provision). Note this list only guards CASE drift — see BANNED_PHRASES for the reversion guard.
  "Section 54 trust account",
  "PDF + JSON + ZIP",
  "72 hours",
  "Information Regulator",
] as const
