/**
 * lib/reports/screening/_web/NarrativeSection.tsx — Three-column AI narrative
 *
 * Mirrors PDF Narrative section (ObservedStrengths, AssessmentSynthesis §6.6).
 * Tribunal-match: same three columns, same content discipline.
 * Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §6.6, Phase F.2.
 */
import type { NarrativeResponse } from "@/lib/screening/fitScoreNarrative"
import { SectionLabel } from "./shared"

function Column({
  label, items, emptyText,
}: Readonly<{ label: string; items: string[]; emptyText: string }>) {
  return (
    <div>
      <SectionLabel>{label}</SectionLabel>
      {items.length > 0 ? (
        <ul className="space-y-1.5 list-none">
          {items.map((s, i) => (
            <li key={i} className="text-sm text-foreground leading-relaxed">{s}</li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground italic">{emptyText}</p>
      )}
    </div>
  )
}

export function NarrativeSection({ narrative }: Readonly<{ narrative: NarrativeResponse }>) {
  return (
    <div className="grid grid-cols-3 gap-6">
      <Column
        label="Observed Strengths"
        items={narrative.observedStrengths}
        emptyText="No observed strengths above the Limited Visibility threshold for this lease."
      />
      <Column
        label="Observed Concerns"
        items={narrative.observedConcerns}
        emptyText="No material concerns observed at this verification level."
      />
      <Column
        label="Limited Visibility"
        items={narrative.limitedVisibility}
        emptyText="All standard signals available."
      />
    </div>
  )
}
