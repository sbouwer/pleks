# Comparative mode — doctrine

## Cognitive task

The Comparative mode serves cross-applicant differentiation: the agent's primary task is to see how four applicants differ from each other on the same set of metrics. N=4 (four-applicant leases) is the canonical comparative condition. The spread between applicants — income spread, verification spread, bureau spread — is the primary reading object. Uniformity is good; divergence requires explanation.

## Zone hierarchy

| Zone | Label | Responsibility |
|---|---|---|
| Zone 1 | Minimal header | Applicant label (A/B/C/D), compact name, nationality status. No typographic prominence for individual identity — the household spread is the subject. |
| Zone 2 | Rail dissolved into comparison rows | Context rail ceases to exist as a separate zone. Identity (minimal: ID type, no age/sex) appears as the first comparison row inside the card, not in a separate column. |
| Zone 3 | Comparison rows | Same metric across all 4 applicants readable on the same horizontal axis. Income, verification, bureaus, network. |
| Zone 4 | Flag row | Aggregate signals across all applicants. Reserved for per-applicant material flags when the type supports them. |

## Reading direction

Horizontal across applicants. The agent reads each metric across all four cards before moving to the next metric. The 2×2 grid positions cards A/B in the top row and C/D in the bottom row so that top-row and bottom-row comparisons remain possible even in a limited-width layout. Web substrate may use a comparison table (metric rows, applicant columns) to make horizontal reading explicit.

## Framing semantics

- Card headers: `C.surface.paperSunk` (PDF) / `bg-paper-sunk` (web) — framing surface.
- Card bodies: no background fill — reading surface.
- PDF layout: 2×2 grid, `width: '50%'` per card, `flexWrap: 'wrap'`.
- Web layout: horizontal comparison table or 4-column flex, implementing the same horizontal-across-applicants reading direction through web-native idioms.

## Anti-patterns specific to this mode

- **Mode leakage into comparative from summary.** Restoring vertical reading direction inside a comparative primitive — making it "look like 4 summary cards in a row" — destroys the horizontal-across-applicants reading task. Comparative's defining property is directional cognition. Losing horizontal direction collapses it back into "smaller summary" (Mode-leakage anti-pattern, §8.6).
- **Per-card depth inflation.** Adding job title, full bureau names, or other interpretive-depth fields to each card defeats the spread-first posture. Comparative cards carry comparison rows, not evidentiary depth.
- **Substrate-as-canonical.** Web implementations must not port the PDF 2×2 card grid element-for-element. Web-native idioms (comparison table, horizontal flex with scroll-snap) achieve the same horizontal reading direction using appropriate substrate patterns.

## Cross-references

- Adjacent mode downward: Summary (N=3) — vertical household synthesis. Comparative's horizontal direction is the contrasting posture.
- Adjacent mode upward: Operational (N>=5) — row scanning, card metaphor dissolved. Comparative still maintains card-per-applicant structure within the horizontal grid.
- Spec: ADDENDUM_14H_DENSITY_SURFACE_PASS §4.4 (Zone behaviour by mode); §8.6 (Mode-leakage anti-pattern); D-DSP-29/30 (parity is semantic, not structural; substrate-as-canonical forbidden).
