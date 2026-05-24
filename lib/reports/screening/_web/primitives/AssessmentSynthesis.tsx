/**
 * lib/reports/screening/_web/primitives/AssessmentSynthesis.tsx — §4.2 deterministic synthesis
 *
 * Notes:  Web parity for _pdf/primitives/AssessmentSynthesis.tsx.
 *         No AI call — fully reproducible from report data via buildSynthesis(data).
 */
import type { JSX } from "react"
import type { FitScoreReportData } from "@/lib/reports/screening/_primitives/theme"
import { buildSynthesis } from "@/lib/screening/prompts/synthesisTemplate.v1.0.2"
import { BlockHeader } from "./BlockHeader"

interface AssessmentSynthesisProps {
  data: FitScoreReportData
}

export function AssessmentSynthesis({ data }: Readonly<AssessmentSynthesisProps>): JSX.Element {
  return (
    <div className="border border-border bg-card mb-5">
      <BlockHeader label="4.2" title="Assessment synthesis" />
      <div className="px-4 pt-4 pb-4">
        <p className="text-sm text-foreground leading-relaxed mb-3">{buildSynthesis(data)}</p>
        <p className="font-mono text-[9px] text-muted-foreground/60">Observed concerns and limited visibility are detailed in §2.3.</p>
      </div>
    </div>
  )
}
