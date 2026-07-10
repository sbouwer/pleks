# Numbering & cross-reference doctrine

This document governs how §-numbering, cross-reference chips, density tiers,
and primitive scoping work in the FitScore PDF **and web** primitives.
Established 2026-05-23 after a normalization pass; extended with breakpoint +
scoping doctrine 2026-05-23 after E.6/E.7 completion; extended with
parity-atomic invariant + web anchor convention 2026-05-24 (F.2 respec);
extended with full editorial-mode framework + surface-token doctrine + methodology-variant dispatch + anti-patterns 2026-05-26 (Q0–Q5 Density & Surface Pass lock — see `ADDENDUM_14U_DENSITY_SURFACE_PASS.md`).

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

### Parity scope: semantic, not structural (locked 2026-05-27)

The parity-atomic invariant governs **what** must be present on both sides; it
does not constrain **how** each side renders. Specifically:

> Parity-atomic invariant guarantees consistency of editorial mode semantics,
> cognitive posture, and evidentiary outcomes across PDF and web primitives.
> It does not require structural or folder-level symmetry between rendering
> targets. PDF and web are independent render substrates that must converge
> on identical cognitive interpretation, but may diverge in implementation
> topology, component granularity, and interaction affordances.

**Parity applies to:**

- Mode definitions (the same four modes exist on both substrates)
- Zone responsibilities (Header / Context rail / Verification body / Signal strip)
- Disclosure rules (which fields surface in which mode)
- Evidentiary semantics (what each field communicates and how)
- Anti-pattern behaviour (the seven anti-patterns apply on both substrates)
- Cognitive posture per mode (the reading direction, identity posture, verification posture lock from Q1)

**Parity does NOT apply to:**

- File structure (PDF may use a flat layout file; web may use composed atoms)
- Component decomposition (PDF Comparative may be a single `View`; web Comparative may be a `<Grid>` + `<Card>` composition)
- Folder symmetry (PDF and web can organise their internals differently if the substrate's idioms demand it)
- Render-tree shape (react-pdf's `View` tree vs HTML's DOM tree can differ structurally)
- Interactive affordances (web may add hover, expand-on-click, sort, filter; PDF cannot have these and isn't expected to)

**Doctrinal consequence:**

> PDF and web are projections of the same cognitive model onto different
> substrates. The cognitive model is canonical; the projections are
> substrate-native.

This frees web to use HTML+Tailwind+interactive idioms natively (e.g. a horizontal
scroll row for Comparative mode rather than a card grid) provided the cognitive
posture is preserved. It frees PDF to use react-pdf's fixed-document idioms
(e.g. wrap={false} rows, page-break-aware composition) without forcing web to
match them. What is enforced is that *the agent's cognitive experience* is
equivalent across both — same mode, same reading direction, same disclosure,
same evidentiary outcome.

**Authoring rule for substrate-specific primitives:**

A per-mode `doctrine.md` co-located with the primitive (per the editorial-mode
framework below) declares the cognitive intent. The PDF implementation file and
the web implementation file are both judged against the same `doctrine.md`. If
either implementation fails to embody the doctrinal claim, that's a primitive
defect, not a substrate-divergence.

This is the rule that makes (a) four-mode parity safe: web isn't required to
port PDF's render tree, but it IS required to embody the same cognitive intent.
The doctrine.md per mode is the contract both sides must satisfy.

### Anti-pattern: substrate-as-canonical (locked 2026-05-27)

When authoring new web primitives, the temptation is to port the PDF render
tree into HTML element-for-element — because PDF "already exists" and web is
"the new side." This is wrong. PDF is not canonical; it is the first substrate
to land. Web is not a port; it is an independent projection of the same
cognitive model.

Symptoms of substrate-as-canonical thinking:

- Web primitive imports PDF primitive's helpers and tries to translate `View`/`Text` into `div`/`span`
- Web primitive's structure mirrors PDF's column/row decomposition because PDF's was "the design"
- Web primitive declines to use interactive affordances (hover states, click-to-expand) because "PDF doesn't have them"
- Web primitive's CSS replicates PDF's hard pixel measurements rather than using CSS-native sizing idioms

The fix: read the per-mode `doctrine.md`, then author the web primitive in
web-native idioms that embody the doctrinal claim. Cross-reference PDF only to
confirm the cognitive outcome is equivalent, not to copy the render shape.

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

## ApplicantDetail editorial modes (multi-applicant residential)

> **Vocabulary updated 2026-05-26 (Q0 lock).** The previous density-tier naming
> (`rich` / `medium` / `compact` / `tabular`) has been retired and replaced with
> editorial-mode names that describe reading posture. The migration retires the
> density vocabulary across both PDF and web primitives — see
> `ADDENDUM_14U_DENSITY_SURFACE_PASS.md` for the implementation phasing.

The ApplicantDetail primitive family renders all applicants on a dedicated §1 page
(positioned after BandLadder, before DimensionCardEditorial). The dispatched mode
adapts to applicant count via editorial-mode names — NOT viewport-driven responsive
breakpoints. Editorial semantic compression, not CSS responsive scaling.

| N    | Mode           | Cognitive task                                                      |
|------|----------------|---------------------------------------------------------------------|
| 1    | (omitted)      | ApplicantDetail not rendered — IdentityRow only                     |
| 2    | `interpretive` | Slow evidentiary reading; per-applicant depth                       |
| 3    | `summary`      | Balanced household synthesis                                        |
| 4    | `comparative`  | Cross-applicant differentiation; horizontal-across-applicants       |
| ≥5   | `operational`  | Throughput-first scanning; queue-style row disposition              |

### Mode-by-mode reading posture (locked 2026-05-26)

| Mode | Primary reading direction | Identity posture | Verification posture | Zone 4 name |
|---|---|---|---|---|
| interpretive | vertical within applicant | person-first | evidentiary | Signal strip |
| summary | vertical household synthesis | household-first | balanced | Signal strip |
| comparative | horizontal across applicants | spread-first | differential | Flag row |
| operational | row scanning | throughput-first | dispositional | Disposition column |

### Zone composition (interpretive — flagship mode)

Interpretive mode composes four zones per applicant card. The zones encode
distinct semantic jobs; they are not visual decoration.

1. **Header** — identity and role-in-lease framing. Applicant label, full name (prominent typography), nationality status as chip. Generation timestamp on first applicant only.
2. **Context rail** — identity context that frames how to read the verification body. Masked ID / passport+DOB, sex, age, Pleks-network status with tenancy count, agent note (when present).
3. **Verification body** — evidentiary substance. Employer + job title + tenure (month-resolution), verified income + income share %, evidence tier label, verification check summary with chip-level disclosure, bureau coverage with full names.
4. **Signal strip** — adjudication signals. Per-applicant material flag pills, "View applicant in §2" anchor chip.

### Zone behaviour across modes

| Zone | interpretive (N=2) | summary (N=3) | comparative (N=4) | operational (N≥5) |
|---|---|---|---|---|
| Header | Per-applicant full header, vertical stack | Per-applicant compact header, vertical stack | Per-applicant minimal header, horizontal across cards | Inline row label only |
| Context rail | Full vertical rail beside verification body | Narrow vertical rail, visually subordinated | Dissolved into comparison rows | Ceases to exist as a conceptual zone |
| Verification body | Full verification narrative + full bureau names + tier label | Compressed (check count, bureau full names retained) | Comparison-first — same metric across all 4 cards on one row | Single row per applicant, key metrics as columns |
| Zone 4 | Signal strip (per-applicant flags + §2 anchor) | Signal strip (per-applicant flags) | Flag row (aggregate across all 4) | Disposition column |

### Rail-discipline corollary

Summary mode retains a *narrow vertical rail* (visually subordinated) rather
than collapsing horizontally. Horizontal rail collapse at N=3 would drift the
mode toward comparative; that drift is the failure mode the rail discipline
prevents. Summary's defining property is *household-as-unit* reading.

Operational mode's rail is *absent*, not compressed. Operational is not
"compressed interpretive" — it's a different information architecture
entirely. The card metaphor effectively dissolves in operational mode; the
layout reads as a workflow table, not as a card collection.

### Per-mode primitive families (locked 2026-05-26)

Each mode is its own primitive. The four modes do not share a primitive with
branching logic; they share a doctrinal framework expressed independently per mode.

```
lib/reports/screening/_pdf/primitives/ApplicantDetail/
├── interpretive/
│   ├── ApplicantDetailInterpretive.tsx
│   └── doctrine.md
├── summary/
│   ├── ApplicantDetailSummary.tsx
│   └── doctrine.md
├── comparative/
│   ├── ApplicantDetailComparative.tsx
│   └── doctrine.md
└── operational/
    ├── ApplicantDetailOperational.tsx
    └── doctrine.md
```

Mirror structure on `_web/primitives/ApplicantDetail/`. Parity-atomic invariant
applies per primitive.

Outer `ApplicantDetail.tsx` is a thin dispatcher; callers continue to invoke
`<ApplicantDetail applicants={...} />` and never see the mode taxonomy unless
they're authoring a mode primitive.

### Shared-layer boundary (load-bearing)

> The shared layer stops at semantic tokens. JSX render trees are mode-local.
> Shared data schema is not shared rendering doctrine.

Shared across modes: types, semantic labels, scoring/formatting helpers,
surface tokens, typography tokens, risk semantics.

Not shared across modes: JSX render trees, layout helpers that encode mode-
specific structure, field-grouping decisions, reading-direction primitives.

Authoring a "shared layout helper" used across two modes is the architectural
smell that collapses the per-mode discipline back into one-primitive-with-
branches. Future contributors hit this temptation when two modes look similar
at a glance; the discipline is to resist it because *similar appearance does
not mean shared rendering doctrine.*

### Doctrine files are normative

> Mode doctrine files are normative artefacts, not commentary. Each `doctrine.md`
> co-located with a mode primitive is treated as implementation-governing
> specification. Changes to zone hierarchy, reading direction, pacing, or framing
> semantics require doctrine updates in the same PR. Primitive drift without
> doctrine drift becomes review-visible.

Each `doctrine.md` contains: cognitive task statement; zone hierarchy with
per-zone responsibilities; reading direction declaration; framing semantics
(which surface tokens this mode uses where); anti-patterns specific to this
mode; cross-references to adjacent modes.

### Overflow handling

If card content overflows the available page space at any tier, react-pdf
reflows naturally to a second applicants page. Do NOT auto-degrade to a
lower tier on overflow — the mode is applicant-count driven, not
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
- `MethodologyEyebrow` (framing primitive — see Methodology-variant dispatch below)
- Narrative primitives (`ObservedStrengths`, `AssessmentSynthesis`)

### Residential-specific (build parallel primitives for commercial)

- `IdentityRow` — assumes natural-person data (masked SA ID, sex, age)
- `ApplicantDetail` + 4 mode primitives — built for residential consumer context
- `DimensionCardEditorial` — bound to personal affordability/stability semantics
- `RiskUncertaintySplit` — driven by individual income validation patterns

### Anti-pattern (DO NOT)

Do NOT add `commercial?: boolean` or `reportFamily` discriminator props to
residential-specific primitives. Do NOT add optional commercial fields to
the residential `FitScoreReportData` type. Do NOT pre-emptively "prepare"
residential code for commercial via config flags.

Doctrine: preserve clean extension seams, not speculative convergence.

See `brief/build/_ADDENDUM/ADDENDUM_14S_FITSCORE_COMMERCIAL.md` for the
commercial scaffold + non-goals section.

## Editorial-mode framework (full lock — 2026-05-26)

These principles are binding for all current and future primitive work. They
resolve the methodology tension exposed by F3 (2026-05-24) and gate the
Commercial Build Phase.

### Principle 1 — Editorial modes describe reading posture, not density

> Editorial-mode names describe the reading posture the report produces,
> not the density of information rendered.

The contributor's question when working on a tier-aware primitive is *"what
cognitive task is this mode optimising for?"* — not *"which fields disappear
at this tier?"* Field visibility is downstream of reading posture.

### Principle 2 — Modes are family-scoped vocabularies

> Modes are family-scoped vocabularies. Residential and commercial
> implementations share the editorial-mode framework, not a universal
> naming taxonomy.

The framework (per-mode primitive families, co-located doctrine, shared semantic
tokens only, methodology variants as dispatch overlays) inherits across families.
Vocabulary does not. Commercial defines its own vocabulary against its own
reading postures when commercial primitives are authored.

### Principle 3 — Topology without methodology is cosmetic variance

> A change in column count, card count, or grid geometry is not by itself an
> editorial-mode change. Editorial modes require distinct hierarchy, pacing,
> content distribution, and methodology semantics — not merely a different
> layout shell.

The F3 ship-and-reversion sequence (2026-05-24) is the load-bearing
precedent. A topology change that lacks methodology rationale is cosmetic
variance, not editorial structure.

### Principle 4 — Density tiers are editorial modes, not field-visibility filters

> Each tier must produce a visually distinguishable result — different
> hierarchy, different emphasis, different reading order — not just a
> shorter version of the flagship mode.

Implementing a new tier by adding `if mode === X, skip this field` is a
field-visibility filter, not a mode change.

### Principle 5 — Editorial distinctness and doctrinal coherence are independently validated

> A mode must both read differently from adjacent modes and satisfy its
> own declared cognitive posture in isolation.

This prevents the failure mode where a contributor "passes" coherence by
making the modes merely visually non-identical. Difference alone is not
enough; the posture must be legible. Two review forms answer different
failure modes: side-by-side review surfaces "are these distinct from each
other?"; per-mode review surfaces "does this artefact embody its declared
posture?"

### Principle 6 — Editorial-mode discipline precedes commercial primitives

The editorial-mode framework must be fully codified and validated against
the residential primitive set before any commercial primitives are
authored. Authoring commercial under "same primitive + conditional fields"
inherits the muddiness; the architectural cost of unwinding it grows with
every new commercial primitive.

**Gate:** Commercial Build Phase is blocked until the Density & Surface Pass
(ADDENDUM_14U_DENSITY_SURFACE_PASS.md) is complete, including smoke-render
validation across N=2/3/4/5 applicant variants.

## Methodology-variant dispatch (locked 2026-05-26)

Methodology variants are orthogonal to editorial modes. Each axis has a
distinct mechanism.

> Editorial modes → separate primitive families.
> Methodology variants → dispatch overlays within a family.

This rule tells future contributors what the authoring move is when they
encounter a new methodology case. New evidentiary case (offshore entity,
jurisdiction-limited verification, partial bureau coverage, director-data
insufficiency, guarantor-substitution) → dispatch overlay within an existing
family. New reading posture (entity overview vs director detail in
commercial) → separate primitive family.

### Topology must carry methodology rationale

> Methodology variants may alter topology only when the altered topology
> itself communicates the evidentiary posture of the report. Geometry
> without methodology signalling is cosmetic variance, not editorial
> structure.

The all-foreign-national case is the canonical example: three-card row
composition is justified ONLY because the `MethodologyEyebrow` strip
above the grid carries the evidentiary-class declaration. Without the
eyebrow, the three-card layout collapses back into the F3 failure mode.

### Missing evidence must remain visible

> Missing evidence must remain visually accounted for, even when it is
> methodologically excluded from scoring.

This prevents the failure mode where a contributor silently drops a
zero-weighted dimension because it "looks cleaner." The agent must always
see: what was evaluated, what was unavailable, why the methodology changed.

Generalises into commercial: unavailable director data, offshore entity
opacity, absent guarantees, jurisdictional gaps, partial bureau coverage.
All become *visually accounted-for evidentiary absences*.

### The MethodologyEyebrow primitive

> MethodologyEyebrow is a framing primitive, not a reading primitive.

The eyebrow surfaces the evidentiary class of the report at the section
level, above the dimension grid. Stylistically it reads as a structural
declaration (closer to MetaStrip), not as a warning banner, system alert,
or validation message.

The conceptual division between grid and eyebrow:

> The grid communicates evaluated dimensions; the eyebrow communicates
> evaluation conditions.

These are different semantic layers and should not inhabit the same
container hierarchy. The eyebrow renders as a full-width strip above the
DimensionCardEditorial composition, between SectionHeader and the grid.

### Coverage-state precedence

> Coverage-state classifications supersede methodology variants when
> evidence sufficiency thresholds are not met.

When `band === 'limited_data_profile'`, the LDP layout takes precedence.
The MethodologyEyebrow does NOT render even when `isAllForeignNational`
is true. The two statements are epistemically incompatible: the eyebrow
declares "this methodology was applied"; LDP declares "the methodology
application threshold was not met."

The engine should not appear to "show its work" for a methodology it
ultimately refused to execute.

## Surface-token discipline

Warm-paper page + raised-white card body + tinted structural accents.
This three-layer surface hierarchy gives the report editorial-document tone
rather than dashboard-export tone — the page warms, the cards rise, the
accents tint structural frame elements without invading content zones.
This is the invariant for both PDF and web surface layers.

### The four-token semantic system

> The four-token surface system encodes depth semantics, not arbitrary
> shades. Token names describe the editorial role, not the colour value.

| Token | PDF hex | Web class | Semantic role |
|---|---|---|---|
| `paper` | `#faf9f5` | `bg-paper` | Base reading plane — the warm editorial page |
| `paperRaised` | `#ffffff` | `bg-paper-raised` | Elevated evidentiary container — card bodies that visually elevate off the page |
| `paperSunk` | `#f5f4ef` | `bg-paper-sunk` | Structural framing/accent plane — header strips, BlockHeader chips, table column headers |
| `paperDeeper` | `#eeede7` | `bg-paper-deeper` | Inset analytical/secondary plane — alternating table row striping |

### The framing-vs-reading distinction

The single test future contributors apply when deciding which token a new
element should use:

> Is this element a reading surface, or a framing surface?

A reading surface holds evidentiary content. A framing surface annotates,
structures, or labels that content. The same token vocabulary serves both,
but the semantic role differs.

**Corollary:**

> Small semantic-status elements (chips, tags, outcome pills, structural
> labels) are framing surfaces, not reading surfaces, and may use sunk/
> deeper tokens without violating the surface hierarchy.

This corollary prevents the over-literal "all filled components must use
paperRaised" failure mode. The `VerificationCheckTable` outcomeAbsent chip
using `paperSunk` is correct precisely because the chip is a framing
element, not a content card. Its outcome-tag siblings (`outcomePass` using
`data.wash`, `outcomePartial` using `amber.wash`) follow the same pattern:
data-coloured washes for positive/partial, neutral structural tint for
absent. The three together form a coherent semantic system.

### Two-tier vocabulary rule

Editorial primitives use the semantic vocabulary exclusively. The generic
Tailwind `bg-muted/*` vocabulary is permitted only in generic app UI,
never in editorial primitives.

| Layer | Allowed vocabulary |
|---|---|
| Editorial/report primitives (`_pdf/primitives/*`, `_web/primitives/*`) | `C.surface.*` (PDF), `bg-paper-*` (web) only |
| Generic app UI (`components/*`, `app/(dashboard)/_components/*`) | `bg-muted/*` permitted |

> Semantic naming is part of the enforcement layer.

When a contributor writes `bg-paper-sunk` they are forced to think *"why is
this sunk? is this structural or evidentiary? should this instead be
raised?"* When they write `bg-muted/20` they think *"this looks lighter."*
Different vocabularies produce different cognitive frames. The editorial
vocabulary is the framework's defence against aesthetic-only thinking
bypassing editorial doctrine.

### Card body discipline

A card body that carries a tinted background (`paperSunk`, `bg-muted/20`,
etc.) is a violation. The tint belongs only on structural frame elements
(header strips, chips, table headers) — not on content zones. This creates
visual depth without adding noise to the reading surface.

**Sweep (2026-05-25, corrected 2026-05-25):** Surface-token discipline
corrected against shipped implementation. One violation found and fixed:
`_pdf/primitives/ApplicantDetail.tsx::tabRowAlt` was using `C.surface.paperSunk`
for alternating-row bodies in the tabular (now operational) layout —
corrected to `C.surface.paperDeeper` per the inset analytical/secondary
plane row of the table above.

**Web-side token unification** (2026-05-26 lock — implementation pending
Phase 1 of `ADDENDUM_14U_DENSITY_SURFACE_PASS.md`): Tailwind extension
exposes the four `bg-paper-*` semantic classes; web primitives migrate from
`bg-muted/20` and `bg-muted/10` to the semantic vocabulary; raw `bg-muted/*`
references inside editorial primitives become forbidden post-migration.

## Anti-patterns catalogue (locked 2026-05-26)

These anti-pattern names are grep-able review language. *"This PR introduces
topology-without-rationale"* is more operational than re-explaining the
doctrine every time.

### Compact by deletion

Removing fields from a primitive without changing its reading posture. The
fix isn't "remove more fields" or "remove fewer fields"; it's to make the
mode's reading posture distinct enough that *which fields appear* is
downstream of *what the agent is reading the card for*.

### Topology without rationale

Changing geometry without methodology signalling. The F3 ship-and-reversion
(2026-05-24) is the load-bearing precedent. The fix is the methodology
eyebrow: topology + rationale together carry the editorial statement.
Topology alone is cosmetic variance.

### Visual variance mistaken for editorial variance

Cosmetic spacing changes presented as new modes. A mode that differs from
its neighbours only in padding, gap, or border weight is not a mode. Modes
alter hierarchy, reading direction, content distribution, and framing
semantics.

### Unaccounted absence

Removing unavailable evidence instead of surfacing its exclusion. The
discipline is to surface the methodology-driven exclusion (eyebrow + 3-card
composition for foreign-national; placeholder card for LDP). Missing
evidence must remain visually accounted for.

**D-DSP-31 generalisation rule (2026-05-27):** Framing primitives must not
render when the payload they frame is entirely absent. When `isLdp=true`,
the `DimensionReadingGuide` returns `null` — the reading guide exists to
explain dimension cards, and LDP produces no scored dimension cards to
explain. The same principle extends to any future framing primitive: if the
framed content is fully suppressed, the frame must not survive. Guard prop:
`data: FitScoreReportData`, early return on `data.isLdp`. Both PDF and web
components must carry the same guard (parity-atomic invariant).

### Semantic-token collapse

Using generic muted surfaces inside editorial primitives. After the
2026-05-26 web migration, `bg-muted/*` is forbidden in
`lib/reports/screening/_web/primitives/*`. Semantic paper tokens are the
only allowed surface vocabulary inside editorial code paths.

### Mode leakage

A primitive in one editorial mode adopting the reading direction or layout
idiom of an adjacent mode. Most likely failure: comparative primitives
reverting to vertical reading flow because the author found a vertical
layout easier to compose. Comparative's defining property is *horizontal-
across-applicants* directional cognition.

### Operational miniaturisation

Shrinking interpretive layout instead of designing for throughput posture.
Operational is not "compressed interpretive"; it's a different information
architecture entirely. The card metaphor effectively dissolves in
operational mode. A primitive that renders a shrunken card-collection at
N≥5 is doing the wrong thing — operational wants table-shaped row
scanning, not micro-cards.

## ApplicantDetail section chrome (D-DSP-32/33, locked 2026-05-27)

All four editorial modes (interpretive, summary, comparative, operational)
wrap their full content in an outer card chrome:

```
borderWidth: 0.75  borderColor: C.rule.base  backgroundColor: C.surface.paperRaised  wrap={false}
```

A three-line label block sits inside the outer card (with a border-bottom
separator), before the mode-specific content. The former `secSub` prose
subtitle ("Participant context for all parties to this lease.") is dropped
entirely — its function is absorbed by the label block.

**Label block content:**

| N        | Line 1     | Line 2                        | Line 3             |
|----------|------------|-------------------------------|--------------------|
| N = 1    | APPLICANT  | applicants[0].fullName        | idLine(applicants[0]) |
| N ≥ 2    | APPLICANTS | `{primarySurname} + {N-1}`   | `Joint application` |

`primarySurname` = last whitespace-separated token of `applicants[0].fullName`.

**RunningHeader multi-applicant update (D-DSP-33):** When
`data.applicants.length >= 2`, DocumentShell derives
`"{surname} + {N-1}, JOINT APPLICATION"` as the `applicantName` slot.
RunningHeader applies `sp()` and `.toUpperCase()` internally, so the
derived string is passed as mixed-case. The `, JOINT APPLICATION` suffix
must be present in the passed string (not added inside RunningHeader) so it
survives the toUpperCase call as-is.

**Anti-pattern:** Retaining the `secLabel` / `secSub` pattern at the outer
level while also adding card chrome. The outer card IS the section anchor
now; the three-line block IS the label. Do not double-label.

## Synthesis numeric drop (D-DSP-35, locked 2026-05-27)

`synthesisTemplate.v1.0.3` drops the composite score number from the
standard branch opening sentence:

- v1.0.2: `"{Band label} — composite {score}."`
- v1.0.3: `"{Band label}."`

**Rationale:** The composite score already appears in `EditorialHeadline`
and `BandLadder`. Repeating it in the synthesis paragraph is redundant and
anchors the reviewer's reading on a single number rather than the
dimensional evidence. The band label alone is the correct synthesis signal.

**Versioning discipline:** v1.0.2 is retained on disk. Immutability
invariant: never edit a shipped template in place; create a new version
file. AssessmentSynthesis (PDF + web) imports from v1.0.3 post-lock.

## Smoke-fixture doctrine (locked 2026-05-26)

> Smoke fixtures exist to exercise doctrinal boundaries, not merely
> rendering permutations.

A good fixture answers *"what architectural claim does this render
verify?"* — not *"do we have enough combinations?"*

Each fixture in the canonical suite (`__samples__/density-pass/fixtures/`)
carries an inline comment identifying the doctrine claim it exercises. The
suite is the gold-master set against which future PRs render for visual
regression review. See `ADDENDUM_14U_DENSITY_SURFACE_PASS.md` §7 for the
15-fixture matrix and §8 for the anti-patterns each edge fixture is
designed to surface.
