/**
 * lib/reports/screening/_web/primitives/DocumentReadingGuide.tsx — §5.1 reading guide
 *
 * Notes:  Web parity for _pdf/primitives/DocumentReadingGuide.tsx.
 *         Static reading guide for the full FitScore document. No props.
 */
import type { JSX } from "react"
import { SectionHeader } from "./SectionHeader"
import { BlockHeader }   from "./BlockHeader"

const ROWS = [
  { label: "§1", text: "Profile. Composite score, band assignment, dimensional evidence bars, and the material flags that influenced the result." },
  { label: "§2", text: "Financial Analysis. Income reconciliation, expenditure breakdown, and the risk and uncertainty split that supports the affordability dimension." },
  { label: "§3", text: "Evidence and Credit. Bureau coverage matrix and verification check outcomes." },
  { label: "§4", text: "Assessment Narrative. Observed strengths, concerns, and limited-visibility notes from the assessment engine, followed by the synthesis paragraph." },
  { label: "§5", text: "Document Attestation. This reading guide and the document trail: version metadata, inputs hash, help URL, and POPIA contact." },
] as const

export function DocumentReadingGuide(): JSX.Element {
  return (
    <div className="mb-5">
      <SectionHeader badge="5" title="Document attestation" />
      <div className="border border-border bg-card">
        <BlockHeader label="5.1" title="Reading guide" />
        {ROWS.map((row, i) => (
          <div key={row.label} className={`flex gap-3 px-4 py-2.5 items-start ${i < ROWS.length - 1 ? "border-b border-border" : ""}`}>
            <span className="font-mono text-[11px] font-bold text-foreground w-8 shrink-0">{row.label}</span>
            <span className="flex-1 text-sm text-muted-foreground leading-relaxed">{row.text}</span>
          </div>
        ))}
        <p className="px-4 py-3 border-t border-border text-xs text-muted-foreground/60 leading-relaxed">
          The composite score is metadata for cross-report comparability. It is not a tenancy recommendation. Final tenancy decisions rest with the agent or landlord.
        </p>
      </div>
    </div>
  )
}
