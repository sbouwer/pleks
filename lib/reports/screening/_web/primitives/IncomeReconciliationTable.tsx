/**
 * lib/reports/screening/_web/primitives/IncomeReconciliationTable.tsx — §2.1 income reconciliation
 *
 * Notes:  Web parity for _pdf/primitives/IncomeReconciliationTable.tsx.
 *         PENDING in v1 — requires ADDENDUM_14D bank statement intelligence.
 */
import type { JSX } from "react"
import type { FitScoreReportData } from "@/lib/reports/screening/_primitives/theme"
import { SectionHeader } from "./SectionHeader"
import { BlockHeader }   from "./BlockHeader"
import { PlaceholderCard } from "./PlaceholderCard"

interface IncomeReconciliationTableProps {
  data: FitScoreReportData
}

export function IncomeReconciliationTable({ data }: Readonly<IncomeReconciliationTableProps>): JSX.Element {
  return (
    <div className="mb-5">
      <SectionHeader
        badge="2"
        title="Financial analysis"
        rightLabel={data.financialAnalysis ? data.financialAnalysis.windowLabel : "Pending · ADDENDUM 14D"}
      />
      <div className="border border-border bg-card mb-2">
        <BlockHeader
          label="2.1"
          title="Declared, observed and verified income — reconciled"
          rightTag="Source · payslip · employer · bank statement"
        />
        <div className="p-4">
          <PlaceholderCard
            variant="pending"
            message={
              "Bank statement intelligence (ADDENDUM 14D) will populate declared, observed " +
              "and verified income reconciliation, variance calculation, and evidence tier classification."
            }
          />
        </div>
      </div>
    </div>
  )
}
