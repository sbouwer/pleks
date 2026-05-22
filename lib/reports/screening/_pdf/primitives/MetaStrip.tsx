/**
 * lib/reports/screening/_pdf/primitives/MetaStrip.tsx
 *
 * 4-cell horizontal meta strip below the headline: property, lease intent, ref, agent.
 * F4: Cell 2 = lease intent (term · rent pm / deposit multiplier).
 * F5: Cell 4 sub = EAAB FFC number when present.
 * F6: Cell 3 sub = Submitted date.
 * Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §E.2.
 */

import { View, Text, StyleSheet } from "@react-pdf/renderer"
import { C, FONTS, sp, fmtZAR, fmtShortDate } from "./theme"
import type { FitScoreReportData } from "./theme"

const S = StyleSheet.create({
  strip: {
    flexDirection:    'row',
    borderWidth:      0.75,
    borderColor:      C.rule.base,
    backgroundColor:  C.surface.paperSunk,
    marginBottom:     24,
  },
  cell: {
    flex:              1,
    paddingVertical:   14,
    paddingHorizontal: 18,
    borderRightWidth:  0.75,
    borderRightColor:  C.rule.base,
  },
  cellLast: {
    borderRightWidth: 0,
  },
  label: {
    fontFamily:    FONTS.mono,
    fontSize:      7,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color:         C.ink.mute,
    marginBottom:  8,
  },
  value: {
    fontFamily:    FONTS.mono,
    fontSize:      9,
    color:         C.ink.primary,
    letterSpacing: 0.3,
    lineHeight:    1.4,
  },
  valueSub: {
    fontFamily:  FONTS.sans,
    fontSize:    8,
    color:       C.ink.mute,
    lineHeight:  1.4,
    marginTop:   3,
  },
})

interface MetaStripProps {
  data: FitScoreReportData
}

export function MetaStrip({ data }: Readonly<MetaStripProps>) {
  const { termMonths, monthlyRentCents, depositMultiplier } = data.leaseIntent
  const rentLine    = `${termMonths} months · ${sp(fmtZAR(monthlyRentCents))} pm`
  const depositLine = `Deposit · ${depositMultiplier}x rent`

  return (
    <View style={S.strip}>
      <View style={S.cell}>
        <Text style={S.label}>Property under review</Text>
        <Text style={S.value}>{sp(data.unitLabel)}</Text>
      </View>

      <View style={S.cell}>
        <Text style={S.label}>Lease intent</Text>
        <Text style={S.value}>{rentLine}</Text>
        <Text style={S.valueSub}>{depositLine}</Text>
      </View>

      <View style={S.cell}>
        <Text style={S.label}>Application ref</Text>
        <Text style={S.value}>{sp(data.applicationRef)}</Text>
        <Text style={S.valueSub}>{`Submitted ${sp(fmtShortDate(data.submittedAt))}`}</Text>
      </View>

      <View style={[S.cell, S.cellLast]}>
        <Text style={S.label}>Managing agent</Text>
        <Text style={S.value}>{sp(data.orgName)}</Text>
        {data.orgFfcNumber !== null && (
          <Text style={S.valueSub}>{`EAAB · FFC ${sp(data.orgFfcNumber)}`}</Text>
        )}
      </View>
    </View>
  )
}
