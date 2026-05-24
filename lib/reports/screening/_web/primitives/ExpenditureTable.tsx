/**
 * lib/reports/screening/_web/primitives/ExpenditureTable.tsx — §2.2 expenditure analysis
 *
 * Notes:  Web parity for _pdf/primitives/ExpenditureTable.tsx.
 *         PENDING in v1 — requires ADDENDUM_14D bank statement intelligence.
 */
import type { JSX } from "react"
import type { FitScoreReportData } from "@/lib/reports/screening/_primitives/theme"
import { BlockHeader }    from "./BlockHeader"
import { PlaceholderCard } from "./PlaceholderCard"

interface ExpenditureTableProps {
  data: FitScoreReportData
}

export function ExpenditureTable({ data: _data }: Readonly<ExpenditureTableProps>): JSX.Element {
  return (
    <div className="mb-5">
      <div className="border border-border bg-card mb-2">
        <BlockHeader
          label="2.2.A"
          title="Monthly average outflows by category"
          rightTag="% of verified income · 6-mo mean"
        />
        <div className="p-4">
          <PlaceholderCard
            variant="pending"
            message={
              "Expenditure classification from bank statement intelligence (ADDENDUM 14D) will " +
              "populate this section with monthly average outflows by category, share of income, and tag source."
            }
          />
        </div>
      </div>

      <div className="border border-border bg-card">
        <BlockHeader
          label="2.2.B"
          title="Disposable position — verified income, all outflows, residual"
          rightTag="Same axis · income vs outflows"
        />
        <div className="p-4">
          <PlaceholderCard
            variant="pending"
            message={
              "Disposable income visualization will populate this section when bank statement " +
              "intelligence is available. Shows income, total outflows, and net disposable on a shared axis."
            }
          />
        </div>
      </div>
    </div>
  )
}
