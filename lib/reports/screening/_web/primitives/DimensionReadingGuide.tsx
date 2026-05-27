/**
 * lib/reports/screening/_web/primitives/DimensionReadingGuide.tsx — static doctrine card
 *
 * Notes:  Web parity for _pdf/primitives/DimensionReadingGuide.tsx.
 *         Explains bar, qual headline, and observations fields to the reviewer. No props.
 */
import type { JSX } from "react"
import type { FitScoreReportData } from "@/lib/reports/screening/_primitives/theme"
import { BlockHeader } from "./BlockHeader"

const ROWS = [
  {
    label: "The bar",
    text:  "Shows the applicant's dimensional score (0-100) with a threshold marker. Scores above the marker sit within the preferred range for this profile class.",
  },
  {
    label: "The qual headline",
    text:  "Summarises the engine's primary signal for each dimension. Algorithmic output — read alongside the observations, not in isolation.",
  },
  {
    label: "The observations",
    text:  "Analyst-facing notes derived from the same evidence the engine used. They surface data points the score alone cannot fully represent.",
  },
] as const

export function DimensionReadingGuide({ data }: Readonly<{ data: FitScoreReportData }>): JSX.Element | null {
  if (data.isLdp) return null
  return (
    <div className="border border-border bg-card mb-5">
      <BlockHeader label="—" title="Reading guide · Dimensions" rightTag="How to read the four dimension cards above" />
      {ROWS.map((row, i) => (
        <div key={row.label} className={`flex gap-3 px-4 py-2.5 items-start ${i < ROWS.length - 1 ? "border-b border-border" : ""}`}>
          <span className="w-32 shrink-0 text-sm font-semibold text-foreground leading-relaxed">{row.label}</span>
          <span className="flex-1 text-sm text-muted-foreground leading-relaxed">{row.text}</span>
        </div>
      ))}
    </div>
  )
}
