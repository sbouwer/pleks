/**
 * lib/reports/screening/_web/primitives/RiskUncertaintySplit.tsx — §2.3 risk and uncertainty split
 *
 * Notes:  Web parity for _pdf/primitives/RiskUncertaintySplit.tsx.
 *         Left: observed concerns (risk). Right: limited visibility (uncertainty).
 *         COMPOSITE.md §1.2: risk = observed; uncertainty = absent/incomplete.
 */
import type { JSX } from "react"
import type { FitScoreReportData } from "@/lib/reports/screening/_primitives/theme"
import { BlockHeader } from "./BlockHeader"

interface ColProps {
  docRef: string
  title:  string
  items:  string[]
  empty:  string
}

function Col({ docRef, title, items, empty }: Readonly<ColProps>): JSX.Element {
  return (
    <div className="flex-1 border border-border">
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border bg-paper-sunk">
        <div>
          <div className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground mb-0.5">{docRef}</div>
          <div className="text-sm font-bold text-foreground">{title}</div>
        </div>
        <span className="font-mono text-[9px] text-muted-foreground border border-border px-2 py-0.5 rounded-sm">
          {items.length} item{items.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="p-3 flex flex-col gap-2">
        {items.length === 0 ? (
          <p className="text-xs text-muted-foreground/60">{empty}</p>
        ) : (
          items.map((item, i) => (
            <div key={`${i}-${item.slice(0, 16)}`} className={`pb-2 ${i < items.length - 1 ? "border-b border-border" : ""}`}>
              <p className="text-sm text-foreground leading-relaxed">{item}</p>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

interface RiskUncertaintySplitProps {
  data: FitScoreReportData
}

export function RiskUncertaintySplit({ data }: Readonly<RiskUncertaintySplitProps>): JSX.Element {
  const concerns   = data.narrative.observedConcerns  ?? []
  const visibility = data.narrative.limitedVisibility ?? []

  return (
    <div className="mb-5">
      <div className="border border-border bg-card mb-2">
        <BlockHeader label="2.3" title="Risk and uncertainty" />
        <div className="px-4 py-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            The left column lists signals that were observed in the supplied evidence.
            The right column lists information that was not available or was incomplete.
            Both inform manual review, but they are not the same kind of finding and must not be conflated.
          </p>
        </div>
      </div>

      <div className="flex gap-2.5">
        <Col
          docRef="2.3.A · Risk"
          title="Observed concerns"
          items={concerns}
          empty="No concerns recorded for this applicant."
        />
        <Col
          docRef="2.3.B · Uncertainty"
          title="Limited visibility"
          items={visibility}
          empty="No visibility gaps recorded."
        />
      </div>
    </div>
  )
}
