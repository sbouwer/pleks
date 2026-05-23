# Numbering & cross-reference doctrine

This document governs how §-numbering and cross-reference chips work in the
FitScore PDF primitives. Established 2026-05-23 after a normalization pass.

## Section numbering

1. Top-level sections (§1–§5) use SectionHeader chips with the bare number.
2. Subsections (§2.1, §2.2, …) use BlockHeader chips with dot notation.
3. Sub-blocks use uppercase letter suffixes (§2.2.A, §2.2.B) ONLY when
   multiple sibling sub-blocks exist. Singleton sub-blocks drop the letter.
4. Every numbered subsection gets a proper BlockHeader treatment. Do NOT
   use inline labels in place of BlockHeader chips for numbered subsections.

## Cross-reference chips (doctrine — DO NOT DRIFT)

Cross-reference chips may reference only doctrinal blocks (real SectionHeader
or BlockHeader subsections), never presentation primitives (signal cards,
chrome, layout components).

If a signal card or dimension card carries a cross-reference chip, the chip
MUST resolve to a real BlockHeader chip elsewhere in the document. If no
real anchor exists, the chip is omitted entirely. Do NOT invent §-numbers
to provide aspirational structure — that creates fake traceability and
degrades the document's Tribunal-defensibility.

Examples (current state, 2026-05-23):

| Card                                  | Chip | Anchor                |
|---------------------------------------|------|-----------------------|
| Page 1 BandLadder confidence card     | none | (no real anchor)      |
| Page 1 BandLadder material flags card | none | (no real anchor)      |
| Page 1 BandLadder verification card   | 3.2  | §3.2 Verification     |
| Page 2 Affordability dimension card   | 2    | §2 Financial analysis |
| Page 2 Stability dimension card       | none | (distributed)         |
| Page 2 Credit Behaviour dimension     | 3.1  | §3.1 Bureau coverage  |
| Page 2 Verification Integrity card    | 3.2  | §3.2 Verification     |

## LDP rendering doctrine

Limited Data Profile (LDP) is a coverage-state classification, not a risk band.
It represents an absence of placement, not a low-confidence placement.

1. `band === 'limited_data_profile'` sets `score: null`, `confidenceIndex: 'insufficient'`,
   and zero or more of `affordability`, `stability`, `verificationIntegrity` to `null`.
2. Null dimension scores render as a `notAssessed` PlaceholderCard — NOT a deficit bar.
3. `confidenceIndex === 'insufficient'` renders with sub-description
   "Evidence insufficient for comparative placement". Do NOT map to 'low'.
4. The synthesis paragraph uses synthesisTemplate.v1.0.2 LDP branch:
   "Limited Data Profile — composite not positioned. N of 4 dimensions had scoreable
   evidence available. Band placement requires evidence across all four primary
   dimensions. Final tenancy decisions rest with the agent or landlord."
5. INVARIANT: Do NOT collapse 'insufficient' to 'low' during any refactor.
   LDP is not a degraded risk band. The distinction is critical for agent guidance
   and Tribunal defensibility.
