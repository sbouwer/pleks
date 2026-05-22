/**
 * lib/reports/screening/_pdf/primitives/MetaStrip.tsx
 *
 * 4-cell horizontal meta strip below the headline: property, applicants, ref, agent.
 * Maps to .cover in HTML reference.
 * Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §E.2.
 */

import { View, Text, StyleSheet } from "@react-pdf/renderer"
import { C, sp, fmtShortDate } from "./theme"
import type { FitScoreReportData } from "./theme"

const S = StyleSheet.create({
  strip: {
    flexDirection:   'row',
    borderWidth:     0.75,
    borderColor:     C.rule.base,
    backgroundColor: C.surface.paperSunk,
    marginBottom:    24,
  },
  cell: {
    flex:            1,
    paddingVertical:   14,
    paddingHorizontal: 18,
    borderRightWidth:  0.75,
    borderRightColor:  C.rule.base,
  },
  cellLast: {
    borderRightWidth: 0,
  },
  label: {
    fontFamily:    'JetBrains Mono',
    fontSize:      7,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color:         C.ink.mute,
    marginBottom:  8,
  },
  value: {
    fontFamily:    'JetBrains Mono',
    fontSize:      9,
    color:         C.ink.primary,
    letterSpacing: 0.3,
    lineHeight:    1.4,
  },
  valueSub: {
    fontFamily:  'Inter Tight',
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
  const totalApplicants = 1 + data.coApplicantCount
  const applicantsLine  = totalApplicants === 1
    ? sp(data.primaryApplicantName)
    : `${sp(data.primaryApplicantName)} + ${data.coApplicantCount}`

  return (
    <View style={S.strip}>
      <View style={S.cell}>
        <Text style={S.label}>Property under review</Text>
        <Text style={S.value}>{sp(data.unitLabel)}</Text>
      </View>

      <View style={S.cell}>
        <Text style={S.label}>Applicant{totalApplicants > 1 ? 's' : ''}</Text>
        <Text style={S.value}>{applicantsLine}</Text>
        {totalApplicants > 1 && (
          <Text style={S.valueSub}>{totalApplicants} total applicants</Text>
        )}
      </View>

      <View style={S.cell}>
        <Text style={S.label}>Application ref</Text>
        <Text style={S.value}>{sp(data.applicationRef)}</Text>
        <Text style={S.valueSub}>Generated {sp(fmtShortDate(data.generatedAt))}</Text>
      </View>

      <View style={[S.cell, S.cellLast]}>
        <Text style={S.label}>Managing agent</Text>
        <Text style={S.value}>{sp(data.orgName)}</Text>
      </View>
    </View>
  )
}
