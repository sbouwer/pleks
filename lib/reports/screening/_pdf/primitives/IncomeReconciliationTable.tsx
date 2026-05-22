/**
 * lib/reports/screening/_pdf/primitives/IncomeReconciliationTable.tsx
 *
 * §2.1 — Income summary: declared, observed, and verified income reconciliation.
 * PENDING in v1 — requires ADDENDUM_14D bank statement intelligence.
 * Renders placeholder when data.financialAnalysis is absent.
 * Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §E.3.
 */

import { View, StyleSheet } from "@react-pdf/renderer"
import { C } from "./theme"
import type { FitScoreReportData } from "./theme"
import { SectionHeader } from "./SectionHeader"
import { BlockHeader }   from "./BlockHeader"
import { PlaceholderCard } from "./PlaceholderCard"

const S = StyleSheet.create({
  wrap: { marginBottom: 16 },
  block: {
    borderWidth:     0.75,
    borderColor:     C.rule.base,
    backgroundColor: C.surface.paperRaised,
    marginBottom:    12,
  },
  blockBody: {
    paddingHorizontal: 16,
    paddingVertical:   14,
  },
})

interface IncomeReconciliationTableProps {
  data: FitScoreReportData
}

export function IncomeReconciliationTable({ data }: Readonly<IncomeReconciliationTableProps>) {
  return (
    <View style={S.wrap}>
      <SectionHeader
        badge="2.1"
        title="Income summary"
        rightLabel={data.financialAnalysis ? data.financialAnalysis.windowLabel : 'Pending · ADDENDUM 14D'}
      />

      <View style={S.block}>
        <BlockHeader
          label="2.1.A"
          title="Declared, observed and verified income — reconciled"
          rightTag="Source · payslip · employer · bank statement"
        />
        <View style={S.blockBody}>
          <PlaceholderCard
            variant="pending"
            message={
              'Bank statement intelligence (ADDENDUM 14D) will populate declared, observed ' +
              'and verified income reconciliation, variance calculation, and evidence tier classification.'
            }
          />
        </View>
      </View>
    </View>
  )
}
