/**
 * lib/reports/screening/_pdf/primitives/IdentityRow.tsx
 *
 * Per-applicant identity row: name + ID context, employment, screening date.
 * F7: Cell 1 = name / ID line (masked ID · sex · age) or Passport + nationality.
 * F8: Cell 2 = employer name / job title · tenure; cell 3 = screening date / time SAST.
 * Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §E.2.
 */

import { View, Text, StyleSheet } from "@react-pdf/renderer"
import { C, D, FONTS, sp, fmtShortDate, fmtTime } from "./theme"
import type { FitScoreReportData, FitScoreApplicantEntry } from "./theme"

const S = StyleSheet.create({
  wrap: {
    borderWidth:     0.75,
    borderColor:     C.rule.base,
    borderTopWidth:  1.5,
    borderTopColor:  C.ink.primary,
    backgroundColor: C.surface.paperRaised,
    marginBottom:    D.primitiveGap,
  },
  row: {
    flexDirection: 'row',
  },
  cell: {
    flex:              1,
    paddingVertical:   D.cardPaddingY,
    paddingHorizontal: D.cardPaddingX,
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
    marginBottom:  6,
  },
  name: {
    fontFamily:    FONTS.sans,
    fontSize:      13,
    fontWeight:    'bold',
    color:         C.ink.primary,
    letterSpacing: -0.1,
    lineHeight:    1.25,
  },
  meta: {
    fontFamily:  FONTS.sans,
    fontSize:    8.5,
    color:       C.ink.mute,
    marginTop:   3,
    lineHeight:  1.4,
  },
  value: {
    fontFamily:    FONTS.mono,
    fontSize:      11,
    color:         C.ink.primary,
    letterSpacing: 0.2,
    lineHeight:    1.25,
  },
  valueSub: {
    fontFamily:  FONTS.sans,
    fontSize:    8.5,
    color:       C.ink.mute,
    marginTop:   3,
    lineHeight:  1.4,
  },
  divider: {
    borderTopWidth:  0.75,
    borderTopColor:  C.rule.base,
    marginVertical:  8,
  },
})

interface IdentityRowProps {
  data: FitScoreReportData
}

function buildIdLine(entry: FitScoreApplicantEntry): string {
  if (entry.isForeignNational) {
    return `Passport · ${sp(entry.nationalityStatus)}`
  }
  const masked = entry.idNumberMasked
    ? sp(entry.idNumberMasked.replaceAll('•', '*'))
    : ''
  const parts: string[] = ['ID']
  if (masked) parts.push(masked)
  if (entry.sex) parts.push(entry.sex)
  if (entry.ageYears !== null) parts.push(`${entry.ageYears}y`)
  return parts.join(' · ')
}

function ApplicantRow({ entry, isFirst, isLast, screenDate, screenTime, isJoint }: Readonly<{
  entry: FitScoreApplicantEntry
  isFirst: boolean
  isLast: boolean
  screenDate: string
  screenTime: string
  isJoint: boolean
}>) {
  const idLine        = buildIdLine(entry)
  const employerName  = sp(entry.employment?.employerName ?? 'Employment not provided')
  const employmentSub = entry.employment
    ? sp(`${entry.employment.jobTitle} · ${entry.employment.tenureDisplay}`)
    : ''

  return (
    <View style={[S.row, isFirst ? {} : S.divider]}>
      <View style={S.cell}>
        <Text style={S.label}>{isJoint ? 'PRIMARY APPLICANT' : 'APPLICANT'}</Text>
        <Text style={S.name}>{sp(entry.fullName)}</Text>
        <Text style={S.meta}>{idLine}</Text>
      </View>

      <View style={S.cell}>
        <Text style={S.label}>Employment</Text>
        <Text style={S.value}>{employerName}</Text>
        {employmentSub !== '' && <Text style={S.valueSub}>{employmentSub}</Text>}
      </View>

      <View style={[S.cell, isLast ? S.cellLast : {}]}>
        <Text style={S.label}>Screened</Text>
        <Text style={S.value}>{screenDate}</Text>
        <Text style={S.valueSub}>{`${screenTime} SAST · auto-refresh nightly`}</Text>
      </View>
    </View>
  )
}

export function IdentityRow({ data }: Readonly<IdentityRowProps>) {
  if (data.applicants.length === 0) return null

  // For multi-applicant leases, IdentityRow shows the primary applicant only.
  // Additional applicants render in ApplicantDetail (placed after BandLadder in §1).
  const visible    = data.applicants.slice(0, 1)
  const isJoint    = data.applicants.length >= 2
  const screenDate = sp(fmtShortDate(data.generatedAt))
  const screenTime = sp(fmtTime(data.generatedAt))

  return (
    <View style={S.wrap} wrap={false}>
      {visible.map((entry, i) => (
        <ApplicantRow
          key={entry.label}
          entry={entry}
          isFirst={i === 0}
          isLast={i === visible.length - 1}
          screenDate={screenDate}
          screenTime={screenTime}
          isJoint={isJoint}
        />
      ))}
    </View>
  )
}
