# Interpretive mode — doctrine

## Cognitive task

The Interpretive mode serves evidentiary reading: the agent's primary task is to understand each applicant as a full individual financial and identity profile before forming a composite household view. N=2 (two-applicant leases) is the canonical interpretive condition because the agent can afford per-applicant depth when the household is small enough to hold two complete profiles in working memory simultaneously.

## Zone hierarchy

| Zone | Label | Responsibility |
|---|---|---|
| Zone 1 | Header | Identity and role-in-lease framing. Applicant label (A/B), full name (typographically prominent), nationality status. |
| Zone 2 | Context rail | Identity context framing the verification body. Masked SA ID / passport, sex, age, Pleks-network status with full tenancy count text. Presented as the left column beside Zone 3. |
| Zone 3 | Verification body | Evidentiary substance. Employer name + job title + tenure (full, month-resolution), verified income + income share %, verification check summary, bureau coverage with full bureau names. |
| Zone 4 | Signal strip | Adjudication-relevant signals. Reserved for per-applicant material flags when the type supports them. |

## Reading direction

Vertical within applicant. The agent reads one applicant fully before moving to the next. Cards stack vertically; horizontal layout is not used in this mode.

## Framing semantics

- Header strip (Zone 1): `C.surface.paperSunk` (PDF) / `bg-paper-sunk` (web) — framing surface.
- Card body (Zones 2–3): no background fill — reading surface on base paper.
- Field labels: `FONTS.mono` uppercase micro-label, `C.ink.mute` — framing.
- Field values: `FONTS.mono`, `C.ink.primary` — evidentiary.

## Anti-patterns specific to this mode

- **Collapsing the rail.** Placing identity context beside verification body in a horizontal layout converts interpretive into comparative reading direction. The two columns (left = context, right = verification body) must remain vertical within each card.
- **Truncating field resolution.** Interpretive carries full bureau names, full employer names, and job title. Dropping these fields to reduce card height is the Compact-by-deletion anti-pattern.
- **Merging Zone 4 into the card footer.** When per-applicant flags are present, Signal strip is a distinct reading zone — not a visual postscript appended to the verification body.

## Cross-references

- Adjacent mode upward: Summary (N=3) — same card metaphor, narrower rail, no job title. Interpretive keeps full employer depth that Summary drops.
- Adjacent mode downward: not applicable (N=2 is the smallest multi-applicant case).
- Comparative (N=4) — horizontal-across-applicants reading direction; the contrasting cognitive task to interpretive's vertical-within-applicant.
- Spec: ADDENDUM_14H_DENSITY_SURFACE_PASS §4.3 (Zone composition, interpretive), §4.4 (Zone behaviour by mode).
