/**
 * lib/reports/screening/_pdf/primitives/ExpenditureTable.tsx
 *
 * §2.2 — Expenditure analysis: monthly average outflows by category (2.2.A)
 * and disposable position bar visualization (2.2.B).
 * PENDING in v1 — requires ADDENDUM_14D bank statement intelligence.
 * Renders placeholder cards when data.financialAnalysis is absent.
 * Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §E.3.
 */

import { View, StyleSheet } from "@react-pdf/renderer"
import { C, D } from "./theme"
import type { FitScoreReportData } from "./theme"
import { SectionHeader }   from "./SectionHeader"
import { BlockHeader }     from "./BlockHeader"
import { PlaceholderCard } from "./PlaceholderCard"

const S = StyleSheet.create({
  wrap: { marginBottom: D.primitiveGap },
  block: {
    borderWidth:     0.75,
    borderColor:     C.rule.base,
    backgroundColor: C.surface.paperRaised,
    marginBottom:    D.primitiveGapTight,
  },
  blockBody: {
    paddingHorizontal: D.cardPaddingX,
    paddingVertical:   D.cardPaddingY,
  },
})

interface ExpenditureTableProps {
  data: FitScoreReportData
}

export function ExpenditureTable({ data }: Readonly<ExpenditureTableProps>) {
  const hasFin = data.financialAnalysis !== undefined

  return (
    <View style={S.wrap} wrap={false}>
      <SectionHeader
        badge="2.2"
        title="Expenditure analysis"
        rightLabel={hasFin ? 'Category engine · txn-tagger' : 'Pending · ADDENDUM 14D'}
      />

      <View style={S.block}>
        <BlockHeader
          label="2.2.A"
          title="Monthly average outflows by category"
          rightTag="% of verified income · 6-mo mean"
        />
        <View style={S.blockBody}>
          <PlaceholderCard
            variant="pending"
            message={
              'Expenditure classification from bank statement intelligence (ADDENDUM 14D) will ' +
              'populate this section with monthly average outflows by category, share of income, and tag source.'
            }
          />
        </View>
      </View>

      <View style={S.block}>
        <BlockHeader
          label="2.2.B"
          title="Disposable position — verified income, all outflows, residual"
          rightTag="Same axis · income vs outflows"
        />
        <View style={S.blockBody}>
          <PlaceholderCard
            variant="pending"
            message={
              'Disposable income visualization will populate this section when bank statement ' +
              'intelligence is available. Shows income, total outflows, and net disposable on a shared axis.'
            }
          />
        </View>
      </View>
    </View>
  )
}
