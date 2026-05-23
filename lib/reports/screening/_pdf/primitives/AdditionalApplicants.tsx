/**
 * lib/reports/screening/_pdf/primitives/AdditionalApplicants.tsx
 *
 * §1 editorial chrome — additional applicants panel for multi-applicant leases.
 * Unnumbered: editorial surface only, not a numbered subsection (DOCTRINE.md).
 * Renders one row per non-primary applicant (applicants.slice(1)).
 * Each row: name + nationality · income (ZAR + share%) · verification · bureaus · network.
 * Only mounted when applicants.length >= 2 — caller guards the condition.
 * Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §6.7.
 */

import { View, Text, StyleSheet } from "@react-pdf/renderer"
import { C, D, FONTS, sp, fmtZAR } from "./theme"
import type { FitScoreApplicantEntry } from "./theme"
import { BlockHeader } from "./BlockHeader"

const S = StyleSheet.create({
  wrap: { marginBottom: D.primitiveGap },
  card: {
    borderWidth:  0.75,
    borderColor:  C.rule.base,
  },

  row: {
    flexDirection:     'row',
    alignItems:        'flex-start',
    paddingHorizontal: D.cardPaddingX,
    paddingVertical:   D.cardPaddingY,
    borderTopWidth:    0.75,
    borderTopColor:    C.rule.base,
  },

  colName:         { flex: 1.5, paddingRight: 8 },
  colIncome:       { flex: 1,   paddingRight: 6 },
  colVerification: { flex: 1,   paddingRight: 6 },
  colBureau:       { flex: 1.4, paddingRight: 6 },
  colNetwork:      { flex: 0.9 },

  cellLabel: {
    fontFamily:    FONTS.mono,
    fontSize:      6.5,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color:         C.ink.mute,
    marginBottom:  3,
  },
  applicantLabel: {
    fontFamily:    FONTS.mono,
    fontSize:      7,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color:         C.ink.mute,
    marginBottom:  4,
  },
  name: {
    fontFamily:    FONTS.sans,
    fontSize:      10,
    fontWeight:    'bold',
    color:         C.ink.primary,
    letterSpacing: -0.1,
    lineHeight:    1.25,
  },
  nationality: {
    fontFamily: FONTS.sans,
    fontSize:   7.5,
    color:      C.ink.faint,
    marginTop:  2,
    lineHeight: 1.4,
  },
  value: {
    fontFamily:    FONTS.mono,
    fontSize:      9,
    color:         C.ink.primary,
    letterSpacing: 0.2,
    lineHeight:    1.25,
  },
  valueSub: {
    fontFamily: FONTS.sans,
    fontSize:   7.5,
    color:      C.ink.mute,
    marginTop:  2,
    lineHeight: 1.4,
  },
  valueMuted: {
    fontFamily:    FONTS.mono,
    fontSize:      9,
    color:         C.ink.mute,
    letterSpacing: 0.2,
    lineHeight:    1.25,
  },
})

function networkDisplay(entry: FitScoreApplicantEntry): string {
  if (entry.pleksNetworkStatus === 'trusted') {
    return `${entry.pleksNetworkTenancyCount} trusted`
  }
  if (entry.pleksNetworkStatus === 'adverse') return 'Adverse record'
  return 'None'
}

function ApplicantRow({ entry }: Readonly<{ entry: FitScoreApplicantEntry }>) {
  const bureaus    = entry.respondingBureaus.length > 0 ? entry.respondingBureaus.join(', ') : 'None'
  const network    = networkDisplay(entry)
  const incomeZar  = fmtZAR(entry.verifiedIncomeCents)
  const shareLabel = `${entry.incomeSharePct}% of joint`
  const checksLabel = `${entry.verificationPassCount} of ${entry.verificationTotal} checks`

  return (
    <View style={S.row}>
      <View style={S.colName}>
        <Text style={S.applicantLabel}>{sp(`Applicant ${entry.label}`)}</Text>
        <Text style={S.name}>{sp(entry.fullName)}</Text>
        <Text style={S.nationality}>{sp(entry.nationalityStatus)}</Text>
      </View>

      <View style={S.colIncome}>
        <Text style={S.cellLabel}>Income</Text>
        <Text style={S.value}>{incomeZar}</Text>
        <Text style={S.valueSub}>{shareLabel}</Text>
      </View>

      <View style={S.colVerification}>
        <Text style={S.cellLabel}>Verification</Text>
        <Text style={S.value}>{checksLabel}</Text>
      </View>

      <View style={S.colBureau}>
        <Text style={S.cellLabel}>Bureau coverage</Text>
        <Text style={entry.respondingBureaus.length > 0 ? S.valueSub : S.valueMuted}>{sp(bureaus)}</Text>
      </View>

      <View style={S.colNetwork}>
        <Text style={S.cellLabel}>Network</Text>
        <Text style={entry.pleksNetworkStatus === 'none' ? S.valueMuted : S.value}>{network}</Text>
      </View>
    </View>
  )
}

interface AdditionalApplicantsProps {
  applicants: FitScoreApplicantEntry[]
}

export function AdditionalApplicants({ applicants }: Readonly<AdditionalApplicantsProps>) {
  const additional = applicants.slice(1)
  if (additional.length === 0) return null

  return (
    <View style={S.wrap} wrap={false}>
      <View style={S.card}>
        <BlockHeader label="—" title="Additional applicants" />
        {additional.map(entry => (
          <ApplicantRow key={entry.label} entry={entry} />
        ))}
      </View>
    </View>
  )
}
