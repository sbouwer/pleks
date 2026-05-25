# Numbering & cross-reference doctrine

This document governs how §-numbering, cross-reference chips, density tiers,
and primitive scoping work in the FitScore PDF **and web** primitives.
Established 2026-05-23 after a normalization pass; extended with breakpoint +
scoping doctrine 2026-05-23 after E.6/E.7 completion; extended with
parity-atomic invariant + web anchor convention 2026-05-24 (F.2 respec).

**This document is authoritative for both `_pdf/primitives/` and
`_web/primitives/`.** The web primitives implement the same doctrine;
DOCTRINE.md is referenced, not duplicated.

## Section numbering

1. Top-level sections (§1–§5) use SectionHeader chips with the bare number.
2. Subsections (§2.1, §2.2, …) use BlockHeader chips with dot notation.
3. Sub-blocks use uppercase letter suffixes (§2.2.A, §2.2.B) ONLY when
   multiple sibling sub-blocks exist. Singleton sub-blocks drop the letter.
4. Every numbered subsection gets a proper BlockHeader treatment. Do NOT
   use inline labels in place of BlockHeader chips for numbered subsections.

5. §1 Profile is the sole top-level section exempt from inline SectionHeader
   chip rendering. The page-1 EditorialHeadline + MetaStrip + IdentityRow +
   BandLadder stack acts as the section-level hero construct; an additional
   `SectionHeader badge="§1"` chip below would be redundant and would dilute
   the editorial intent of the opening surface. §2 through §5 retain inline
   SectionHeader chips on both PDF and web. Anchor resolution for §1 is
   preserved via the `<section id={toDocAnchorId("1")}>` wrapper in
   `FitScoreReport` and the equivalent doc-level anchor on PDF.

## Parity-atomic invariant (locked 2026-05-24 — DO NOT DRIFT)

No `_pdf/primitives/*` doctrinal primitive may be added, removed, or materially
altered without a corresponding `_web/primitives/*` parity update in the same
change-set. The check is file-level: a matching-named file must exist and reflect
the same doctrinal content. This applies to all future PRs — not only F.2.

## Web anchor id convention (locked 2026-05-24)

`SectionHeader` and `BlockHeader` primitives on the web side emit `id` attributes
using normalised `docRef` values:

| docRef | id |
|--------|----|
| `3`    | `fs-3` |
| `3.1`  | `fs-3-1` |
| `3.1.B`| `fs-3-1-b` |

Normalisation rule: lowercase, dots and letter suffixes separated by hyphens,
`fs-` prefix. Lives in `lib/reports/screening/_primitives/anchors.ts` as
`toDocAnchorId(docRef: string): string`. Imported by `_web/primitives/SectionHeader`,
`_web/primitives/BlockHeader`, dimension-card chips, `_web/FitScoreReport` section
wrappers, and `_web/SectionNav`. The helper is doctrinal infrastructure — never
hand-rolled inline, never colocated with a presentation primitive.

Chips render as `<a href={`#${toDocAnchorId(chip.docRef)}`}>` anchor links.
If the target `BlockHeader` does not exist, the chip is omitted — not rendered
as a dead link.

## Verification outcome doctrine (locked 2026-05-24)

`VerificationOutcome` is a doctrinal evidentiary type, shared between PDF and web:

```ts
type VerificationOutcome = 'pass' | 'partial' | 'absent'
```

It represents **final evidentiary interpretation only** — never operational pipeline
state. Dashboard-only transient states live in a separate type:

```ts
type VerificationRuntimeState = 'pending' | 'running' | 'retrying' | 'failed_transport'
```

Runtime states resolve into doctrinal outcomes before PDF generation. Future
contributors must not push retry, inflight, queue, or timeout states into
`VerificationOutcome`. That type boundary enforces the distinction between
decision record and orchestration monitor.

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

## ApplicantDetail density tiers (multi-applicant residential)

The ApplicantDetail primitive renders all applicants on a dedicated §1 page
(positioned after BandLadder, before DimensionCardEditorial). Layout density
adapts to applicant count via semantic tier names — NOT viewport-driven
responsive breakpoints. Editorial semantic compression, not CSS responsive scaling.

| N    | Tier       | Layout                                            |
|------|------------|---------------------------------------------------|
| 1    | (omitted)  | ApplicantDetail not rendered — IdentityRow only   |
| 2    | `rich`     | 2 cards full-width × half-page, stacked           |
| 3    | `medium`   | 3 cards full-width × third-page, stacked          |
| 4    | `compact`  | 4 cards in 2×2 grid (half-width × half-page each) |
| ≥5   | `tabular`  | List view, one row per applicant, no card chrome  |

### Field compression by tier

| Field                       | rich (N=2) | medium (N=3) | compact (N=4) | tabular (N≥5) |
|-----------------------------|------------|--------------|---------------|---------------|
| Applicant label (A/B/C…)    | header     | header       | header        | column        |
| Full name                   | header     | header       | header        | column        |
| Nationality status          | header     | compact      | compact       | column        |
| Masked ID                   | ✓          | ✓            | ✓             | drop          |
| Sex                         | ✓          | drop         | drop          | drop          |
| Age                         | ✓          | ✓            | drop          | drop          |
| Employer name               | ✓          | ✓            | ✓             | drop          |
| Job title                   | ✓          | drop         | drop          | drop          |
| Tenure                      | ✓          | ✓            | drop          | drop          |
| Verified income (ZAR)       | ✓          | ✓            | ✓             | column        |
| Income share %              | ✓          | inline       | inline        | column        |
| Verification N of M         | ✓          | ✓            | ✓             | column        |
| Bureau coverage             | full names | count + div  | count only    | count column  |
| Pleks-network status        | full       | compact      | compact       | column        |
| Network tenancy count       | ✓          | drop         | drop          | drop          |

Drop order rationale: identity context (sex, age, masked ID) drops first
because multi-applicant identity is captured by name + nationality. Then
employment context fades (employer name retained longest). Bureau coverage
shifts from full list to count to recapture vertical space. Income,
verification, network status — the three signals that materially
differentiate applicants — survive to the list view.

### Overflow handling

If card content overflows the available page space at any tier, react-pdf
reflows naturally to a second applicants page. Do NOT auto-degrade to a
lower tier on overflow — the tier is applicant-count driven, not
typography-accident driven. Content-dependent layout switching creates
inconsistent disclosure across otherwise-identical leases and is
QA-hostile.

## Primitive scope (residential vs domain-agnostic)

The editorial primitive set splits into two scopes. **Residential-specific
primitives must not be extended via configuration flags to support
commercial.** Commercial domain primitives are built as parallel
implementations that inherit the shared design language (spacing,
typography, borders, chrome) but support distinct data models.

### Structurally reusable (domain-agnostic editorial language)

- `DocumentShell`, `RunningHeader`, `PageFooter`
- `MetaStrip` (may extend with entity metadata fields for commercial)
- `SectionHeader`, `BlockHeader`
- `AttestationCard`, `DocumentReadingGuide`
- `BandLadder` (may need director/entity segmentation extension for commercial)
- `PlaceholderCard` (all four variants — pending / notSolicited / notApplicable / notAssessed)
- Narrative primitives (`ObservedStrengths`, `AssessmentSynthesis`)

### Residential-specific (build parallel primitives for commercial)

- `IdentityRow` — assumes natural-person data (masked SA ID, sex, age)
- `ApplicantDetail` — built for residential consumer context; density tiers above
- `DimensionCardEditorial` — bound to personal affordability/stability semantics
- `RiskUncertaintySplit` — driven by individual income validation patterns

### Anti-pattern (DO NOT)

Do NOT add `commercial?: boolean` or `reportFamily` discriminator props to
residential-specific primitives. Do NOT add optional commercial fields to
the residential `FitScoreReportData` type. Do NOT pre-emptively "prepare"
residential code for commercial via config flags.

Doctrine: preserve clean extension seams, not speculative convergence.

See `brief/build/_ADDENDUM/ADDENDUM_14H_FITSCORE_COMMERCIAL.md` for the
commercial scaffold + non-goals section.

## Editorial-mode framework

Established 2026-05-25 after the F3 revert audit and the §11.21 Density &
Surface Pass. These principles are binding for all current and future
primitive work. They resolve the methodology tension exposed by F3 and
gate the Commercial Build Phase.

### Principle 1 — Topology changes alone do not constitute a new editorial mode

A change in column count, card count, or grid geometry is not an editorial-mode
change. Editorial modes require distinct hierarchy, pacing, content
distribution, and methodology semantics — not merely a different layout shell.

**Corollary:** Do NOT introduce a conditional grid branch (e.g. "1×3 for
foreign-national") unless the data model and applicant methodology are
substantively different in that branch — and even then, both the new topology
AND the new methodology must be defined simultaneously in the same changeset.
A topology change without a methodology rationale is a visual refactor
dressed as a feature. (Source: Stéan, 2026-05-24; triggered by F3 revert.)

**Holding pattern:** When the methodology for a case type is unresolved, the
"Not applicable" hold state with explanatory sub-text is the correct
primitive response. It keeps the gap visible. A mechanical layout rearrangement
that papers over an unresolved methodology question is strictly worse than
the hold state it replaces.

### Principle 2 — Density tiers are editorial modes, not field-visibility filters

`rich` / `medium` / `compact` / `tabular` are distinct editorial postures, not
subsets of the same visual shell with fields removed. Each tier must produce a
visually distinguishable result — different hierarchy, different emphasis,
different reading order — not just a shorter version of `rich`.

**Corollary:** Do NOT implement a new density tier by adding `if tier === X,
skip this field`. That is a field-visibility filter. A genuine tier change
reorders and regroups content to communicate a different editorial priority.

### Principle 3 — Editorial-mode discipline precedes commercial primitives

The editorial-mode framework (Principles 1 & 2) must be fully codified and
validated against the residential primitive set before any commercial
primitives are authored. Commercial report types introduce different data
models and applicant entities — implementing them before the mode framework
is stable would require a retroactive respec of the commercial layer.

**Gate:** Commercial Build Phase is blocked until §11.21 Density & Surface
Pass is complete, including smoke-render validation across N=2/3/4/5
applicant variants.

### Surface-token discipline

Warm-paper page + raised-white card body + tinted structural accents.
This three-layer surface hierarchy gives the report editorial-document tone
rather than dashboard-export tone — the page warms, the cards rise, the
accents tint structural frame elements without invading content zones.
This is the invariant for both PDF and web surface layers.

| Layer | PDF token | Web token | Used on |
|---|---|---|---|
| Page / outer shell | `C.surface.paper` (#faf9f5) | warm-paper inherit | Document background — the warm editorial page |
| Card body (raised) | `C.surface.paperRaised` (#ffffff) | `bg-card` / `bg-white` | Card bodies that should visually elevate off the page |
| Structural accent | `C.surface.paperSunk` (#f5f4ef) | `bg-muted/20` (web-token unification pending §11.21) | Card header strips, BlockHeader chips, table column headers |
| Subtle accent | `C.surface.paperDeeper` (#eeede7) | `bg-muted/10` (web-token unification pending §11.21) | Alternating table row striping |

A card body that carries a tinted background (`paperSunk`, `bg-muted/20`,
etc.) is a violation. The tint belongs only on structural frame elements
(header strips, chips, table headers) — not on content zones. This creates
visual depth without adding noise to the reading surface.

**Sweep (2026-05-25, corrected 2026-05-25):** Surface-token discipline
corrected against shipped implementation. One violation found and fixed:
`_pdf/primitives/ApplicantDetail.tsx::tabRowAlt` was using `C.surface.paperSunk`
for alternating-row bodies in the tabular (N≥5) layout — corrected to
`C.surface.paperDeeper` per the subtle-accent row of the table above.
Web-side token unification (semantic Tailwind extension exposing
`bg-paper`, `bg-paper-raised`, `bg-paper-sunk`, `bg-paper-deeper`)
deferred to §11.21 Density & Surface Pass — current `bg-muted/20`
/ `bg-muted/10` references stand as the interim Web-side vocabulary.
