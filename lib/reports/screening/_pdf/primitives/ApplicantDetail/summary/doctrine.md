# Summary mode — doctrine

## Cognitive task

The Summary mode serves household synthesis: the agent's primary task is to see the three applicants as a household unit, reading each person's contribution to the joint picture. N=3 (three-applicant leases) is the canonical summary condition. The household frame is held throughout — identity context is subordinated to metrics, and metrics are presented in household-comparison terms (income share %, joint verification count).

## Zone hierarchy

| Zone | Label | Responsibility |
|---|---|---|
| Zone 1 | Compact header | Identity and role-in-lease framing. Smaller badge and name than interpretive; nationality status. |
| Zone 2 | Narrow context rail | Identity context, visually subordinated. Masked SA ID / passport, age (no sex at this mode). Narrow column beside Zone 3. |
| Zone 3 | Compressed verification body | Household-synthesis metrics. Employer + tenure (no job title); income as value + share %; verification as count; bureau count (not full names); network compact. |
| Zone 4 | Signal strip | Adjudication-relevant signals. Reserved for per-applicant material flags when the type supports them. |

## Reading direction

Vertical household synthesis. The agent reads one applicant fully, then moves down to the next, building a household picture from stacked cards. The narrow rail must remain vertical — collapsing it horizontally would drift this mode toward comparative reading direction (horizontal-across-applicants), destroying the household-synthesis posture.

## Framing semantics

- Header strip (Zone 1): `C.surface.paperSunk` (PDF) / `bg-paper-sunk` (web) — framing surface.
- Card body (Zones 2–3): no background fill — reading surface.
- Narrow rail column (Zone 2): visually subordinated via narrower flex width, not via colour change.
- Field values: compact mono, same weight as interpretive but denser vertical rhythm.

## Anti-patterns specific to this mode

- **Collapsing the rail to horizontal.** The narrow vertical rail must be held. A horizontal rail layout converts summary into comparative reading direction. The spec explicitly locks this: "narrow vertical rail must be held; collapsing to horizontal breaks the household-as-unit reading" (§4.4).
- **Adding job title.** Job title is an interpretive-mode field. Adding it here is mode leakage — it converts summary into a denser interpretive without changing reading direction.
- **Using full bureau names.** Bureau count (not names) is the summary-mode field. Full names shift depth toward interpretive.
- **Treating summary as compressed interpretive.** Summary has its own reading posture (household-first). Authoring it as "interpretive with fewer fields" is Compact-by-deletion anti-pattern applied at the mode level.

## Cross-references

- Adjacent mode downward: Interpretive (N=2) — full bureau names, job title, full rail. Summary is the household-synthesis counterpart with a narrower rail.
- Adjacent mode upward: Comparative (N=4) — horizontal reading direction. Summary's vertical stack is the contrasting posture.
- Spec: ADDENDUM_14U_DENSITY_SURFACE_PASS §4.4 (Zone behaviour by mode, critical note on rail discipline).
