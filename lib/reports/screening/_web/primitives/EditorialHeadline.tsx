/**
 * lib/reports/screening/_web/primitives/EditorialHeadline.tsx — page 1 hero block
 *
 * Notes:  Web parity for _pdf/primitives/EditorialHeadline.tsx.
 *         Eyebrow pill, editorial h1 with amber "verification" highlight, doctrine sub.
 */
import type { JSX } from "react"
import { DOCTRINE_DISCLAIMER, fmtDate } from "@/lib/reports/screening/_primitives/theme"
import type { FitScoreReportData } from "@/lib/reports/screening/_primitives/theme"

interface EditorialHeadlineProps {
  data: FitScoreReportData
}

export function EditorialHeadline({ data }: Readonly<EditorialHeadlineProps>): JSX.Element {
  const n      = data.applicants.length
  const plural = n === 1 ? "" : "s"

  return (
    <div className="mb-5">
      <div className="inline-flex items-center gap-2.5 border border-border rounded-full px-3 py-1 bg-muted/20 mb-3">
        <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">FITSCORE · STREAM 2</span>
        <div className="w-px h-3 bg-border" />
        <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">evidence summary</span>
      </div>

      <div className="flex items-end justify-between gap-6 mb-2">
        <h1 className="font-bold text-2xl text-foreground leading-tight tracking-tight">
          A structured{" "}
          <span className="text-amber-600">verification</span>
          {` and financial analysis of ${n} rental applicant${plural}.`}
        </h1>
        <div className="font-mono text-[10px] text-muted-foreground/60 text-right shrink-0">
          <div>Generated</div>
          <div>{fmtDate(data.generatedAt)}</div>
        </div>
      </div>

      <p className="text-sm text-foreground/70 leading-relaxed">{DOCTRINE_DISCLAIMER}</p>
    </div>
  )
}
