# Operational mode — doctrine

## Cognitive task

The Operational mode serves throughput-first scanning: the agent's primary task is to get through a large household lease quickly enough to make a decision today. N>=5 (five or more applicants) is the operational condition. At this scale, per-applicant depth reading is impractical — the agent scans rows, not cards. The report is not the agent's primary cognitive surface; it is one of several lease-processing tasks in a workflow.

## Zone hierarchy

| Zone | Label | Responsibility |
|---|---|---|
| Zone 1 | Row label | Applicant identifier (A, B, C...) as an inline table column. No card header; no typographic prominence. |
| Zone 2 | Rail absent | Context rail does not exist as a conceptual zone at this mode. Identity context (nationality) is one column among many — no structural distinction from other data columns. |
| Zone 3 | Row columns | Throughput-optimised column set: label, name, nationality, income+share, verification count, bureau count, network status. Single row per applicant with alternating stripe for scan ergonomics. |
| Zone 4 | Disposition column | Inline per-applicant signal. Reserved for per-applicant material flags when the type supports them; will appear as the rightmost column when implemented. |

## Reading direction

Row scanning. The agent scans down the table, reading one applicant per row. The column order is fixed — left-to-right priority order matches scan ergonomics (label → name → key financial → evidence quality → network). No horizontal per-metric comparison like comparative mode; the agent is not comparing metric-by-metric but scanning applicant-by-applicant for outliers.

## Framing semantics

- Table header row: `C.surface.paperSunk` (PDF) / `bg-paper-sunk` (web) — framing surface.
- Alternating data rows: `C.surface.paperDeeper` (PDF) / `bg-paper-deeper` (web) — inset analytical plane for scan ergonomics.
- Column headers: FONTS.mono uppercase micro-label, `C.ink.mute`.
- Data values: FONTS.mono, `C.ink.primary`.

## Anti-patterns specific to this mode

- **Operational miniaturisation.** Shrinking interpretive card layout instead of designing for throughput posture. Operational is not "compressed interpretive" — the card metaphor is absent. A primitive that renders micro-cards at N>=5 is doing the wrong thing (Operational-miniaturisation anti-pattern, §8.7).
- **Adding evidentiary depth to rows.** Bureau names, job title, income evidence tier — these are interpretive-mode fields. Adding them to operational rows defeats throughput scanning with depth that the agent cannot use at this scale.
- **Vertical zone structure.** Rendering zones vertically per applicant within the table (stacked sub-rows) re-introduces the card metaphor and destroys row-scanning ergonomics.

## Cross-references

- Adjacent mode downward: Comparative (N=4) — card-per-applicant structure still held. Operational dissolves it entirely.
- Smaller cases: at N<5, the system dispatches to interpretive (N=2), summary (N=3), or comparative (N=4) — each with progressively less depth. Operational is the endpoint of this progression, where depth is replaced by ergonomics.
- Spec: ADDENDUM_14U_DENSITY_SURFACE_PASS §4.2 (Operational reading posture), §4.4 (Zone behaviour — "rail isn't compressed, it's absent"), §8.7 (Operational-miniaturisation anti-pattern).
