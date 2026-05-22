/**
 * lib/reports/screening/_pdf/primitives/IdentityRow.tsx
 *
 * Per-applicant identity row: name, nationality status, verified income, income share.
 * One row per applicant. Maps to .applicant in HTML reference.
 * Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §E.2.
 */

import { View, Text, StyleSheet } from "@react-pdf/renderer"
import { C, sp, fmtZAR } from "./theme"
import type { FitScoreReportData, FitScoreApplicantEntry } from "./theme"

const S = StyleSheet.create({
  wrap: {
    borderWidth:   0.75,
    borderColor:   C.rule.base,
    borderTopWidth: 1.5,
    borderTopColor: C.ink.primary,
    backgroundColor: C.surface.paperRaised,
    marginBottom:  24,
  },
  row: {
    flexDirection: 'row',
  },
  cell: {
    flex:              1,
    paddingVertical:   18,
    paddingHorizontal: 22,
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
  name: {
    fontFamily:    'Inter Tight',
    fontSize:      13,
    fontWeight:    'bold',
    color:         C.ink.primary,
    letterSpacing: -0.1,
    lineHeight:    1.25,
  },
  meta: {
    fontFamily:  'Inter Tight',
    fontSize:    8.5,
    color:       C.ink.mute,
    marginTop:   4,
    lineHeight:  1.4,
  },
  income: {
    fontFamily:    'JetBrains Mono',
    fontSize:      13,
    color:         C.ink.primary,
    letterSpacing: 0.3,
    lineHeight:    1.25,
  },
  incomeSub: {
    fontFamily:  'Inter Tight',
    fontSize:    8.5,
    color:       C.ink.mute,
    marginTop:   4,
  },
  divider: {
    borderTopWidth: 0.75,
    borderTopColor: C.rule.base,
  },
})

interface IdentityRowProps {
  data: FitScoreReportData
}

function ApplicantRow({ entry, isLast, isFirst }: Readonly<{
  entry: FitScoreApplicantEntry; isLast: boolean; isFirst: boolean
}>) {
  const bureausLine = entry.respondingBureaus.join(', ')
  const passLine    = `${entry.verificationPassCount} / ${entry.verificationTotal} checks`

  return (
    <View style={[S.row, isFirst ? {} : S.divider]}>
      <View style={S.cell}>
        <Text style={S.label}>{sp(entry.label)}</Text>
        <Text style={S.name}>{sp(entry.fullName)}</Text>
        <Text style={S.meta}>{sp(entry.nationalityStatus)}</Text>
      </View>

      <View style={S.cell}>
        <Text style={S.label}>Verified income</Text>
        <Text style={S.income}>{sp(fmtZAR(entry.verifiedIncomeCents))} / mo</Text>
        <Text style={S.incomeSub}>{entry.incomeSharePct}% income share</Text>
      </View>

      <View style={[S.cell, isLast ? S.cellLast : {}]}>
        <Text style={S.label}>Verification</Text>
        <Text style={S.income}>{sp(passLine)}</Text>
        <Text style={S.incomeSub}>{sp(bureausLine)}</Text>
      </View>
    </View>
  )
}

export function IdentityRow({ data }: Readonly<IdentityRowProps>) {
  if (data.applicants.length === 0) return null

  return (
    <View style={S.wrap}>
      {data.applicants.map((entry, i) => (
        <ApplicantRow
          key={entry.label}
          entry={entry}
          isFirst={i === 0}
          isLast={i === data.applicants.length - 1}
        />
      ))}
    </View>
  )
}
