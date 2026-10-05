/**
 * lib/reports/screening/_pdf/primitives/EditorialHeadline.tsx
 *
 * Page 1 hero block: 2-token eyebrow pill, editorial thesis H1, doctrine sub.
 * F1: H1 = static editorial thesis with amber highlight on "verification".
 * F2: Eyebrow = "FITSCORE · STREAM 2" | "evidence summary" (third token deferred E.6).
 * F3: Sub = DOCTRINE_DISCLAIMER constant.
 * F4: First line = "Assessed with N of M" (ADDENDUM_14X §4), amber when a party did not complete; absent when the
 *     score carries no stamp (computed before 14X P3).
 * Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §E.2.
 */

import { View, Text, StyleSheet } from "@react-pdf/renderer"
import { C, D, FONTS, DOCTRINE_DISCLAIMER, assessedWithLine, sp, fmtDate } from "./theme"
import type { FitScoreReportData } from "./theme"

const S = StyleSheet.create({
  wrap: {
    marginBottom: D.primitiveGap,
  },
  assessed: {
    fontFamily:    FONTS.mono,
    fontSize:      8.5,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color:         C.ink.mute,
    marginBottom:  8,
  },
  assessedPartial: {
    color: C.amber.ink,
  },
  eyebrow: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               10,
    marginBottom:      10,
    borderWidth:       0.75,
    borderColor:       C.rule.base,
    borderRadius:      999,
    alignSelf:         'flex-start',
    paddingVertical:   4,
    paddingHorizontal: 10,
    backgroundColor:   C.surface.paperSunk,
  },
  eyebrowText: {
    fontFamily:    FONTS.mono,
    fontSize:      7.5,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color:         C.ink.mute,
  },
  eyebrowSep: {
    width:           1,
    height:          9,
    backgroundColor: C.rule.strong,
  },
  titleRow: {
    flexDirection:  'row',
    alignItems:     'flex-end',
    justifyContent: 'space-between',
    gap:            24,
    marginBottom:   6,
  },
  h1: {
    fontFamily:    FONTS.sans,
    fontSize:      D.h1Size,
    fontWeight:    'bold',
    color:         C.ink.primary,
    letterSpacing: -0.4,
    lineHeight:    1.15,
    flex:          1,
  },
  h1Amber: {
    color: C.amber.base,
  },
  dateBlock: {
    fontFamily:    FONTS.mono,
    fontSize:      7.5,
    color:         C.ink.faint,
    letterSpacing: 0.5,
    textAlign:     'right',
    paddingBottom:  2,
  },
  sub: {
    fontFamily:  FONTS.sans,
    fontSize:    10.5,
    color:       C.ink.soft,
    lineHeight:  D.bodyLineHeight,
  },
})

interface EditorialHeadlineProps {
  data: FitScoreReportData
}

export function EditorialHeadline({ data }: Readonly<EditorialHeadlineProps>) {
  const n = data.applicants.length
  const plural = n === 1 ? '' : 's'
  const assessed = assessedWithLine(data)
  const partial  = !!data.assessedWith && data.assessedWith.n < data.assessedWith.m

  return (
    <View style={S.wrap} wrap={false}>
      {assessed && <Text style={partial ? [S.assessed, S.assessedPartial] : S.assessed}>{sp(assessed)}</Text>}
      <View style={S.eyebrow}>
        <Text style={S.eyebrowText}>FITSCORE · STREAM 2</Text>
        <View style={S.eyebrowSep} />
        <Text style={S.eyebrowText}>evidence summary</Text>
      </View>

      <View style={S.titleRow}>
        <Text style={S.h1}>
          {'A structured '}
          <Text style={S.h1Amber}>verification</Text>
          {` and financial\nanalysis of ${n} rental applicant${plural}.`}
        </Text>
        <Text style={S.dateBlock}>
          {'Generated\n'}{sp(fmtDate(data.generatedAt))}
        </Text>
      </View>

      <Text style={S.sub}>{sp(DOCTRINE_DISCLAIMER)}</Text>
    </View>
  )
}
