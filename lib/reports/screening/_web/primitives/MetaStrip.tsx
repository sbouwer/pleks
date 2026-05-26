/**
 * lib/reports/screening/_web/primitives/MetaStrip.tsx — 4-cell horizontal meta strip
 *
 * Notes:  Web parity for _pdf/primitives/MetaStrip.tsx.
 *         Cells: unit · lease intent · application ref · managing agent.
 */
import type { JSX } from "react"
import { fmtZAR, fmtShortDate } from "@/lib/reports/screening/_primitives/theme"
import type { FitScoreReportData } from "@/lib/reports/screening/_primitives/theme"

function Cell({ label, value, sub, isLast = false }: Readonly<{
  label: string; value: string; sub?: string; isLast?: boolean
}>): JSX.Element {
  return (
    <div className={`flex-1 px-3 py-2.5 ${isLast ? "" : "border-r border-border"}`}>
      <div className="font-mono text-[8px] uppercase tracking-widest text-muted-foreground mb-1.5">{label}</div>
      <div className="font-mono text-[11px] text-foreground leading-snug">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground mt-1 leading-snug">{sub}</div>}
    </div>
  )
}

interface MetaStripProps {
  data: FitScoreReportData
}

export function MetaStrip({ data }: Readonly<MetaStripProps>): JSX.Element {
  const { termMonths, monthlyRentCents, depositMultiplier } = data.leaseIntent
  const rentLine    = `${termMonths} months · ${fmtZAR(monthlyRentCents)} pm`
  const depositLine = `Deposit · ${depositMultiplier}x rent`

  return (
    <div className="flex border border-border bg-paper-sunk mb-3">
      <Cell label="Unit"            value={data.unitLabel} />
      <Cell label="Lease intent"    value={rentLine} sub={depositLine} />
      <Cell label="Application ref" value={data.applicationRef} sub={`Submitted ${fmtShortDate(data.submittedAt)}`} />
      <Cell label="Managing agent"  value={data.orgName} sub={data.orgFfcNumber ? `EAAB · ${data.orgFfcNumber}` : undefined} isLast />
    </div>
  )
}
