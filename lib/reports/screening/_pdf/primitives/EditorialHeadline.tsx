/**
 * lib/reports/screening/_pdf/primitives/EditorialHeadline.tsx
 *
 * Page 1 hero block: 2-token eyebrow pill, editorial thesis H1, doctrine sub.
 * F1: H1 = static editorial thesis with amber highlight on "verification".
 * F2: Eyebrow = "FITSCORE · STREAM 2" | "evidence summary" (third token deferred E.6).
 * F3: Sub = DOCTRINE_DISCLAIMER constant.
 * Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §E.2.
 */

import { View, Text, StyleSheet } from "@react-pdf/renderer"
import { C, FONTS, DOCTRINE_DISCLAIMER, sp, fmtDate } from "./theme"
import type { FitScoreReportData } from "./theme"

const S = StyleSheet.create({
  wrap: {
    marginBottom: 24,
  },
  eyebrow: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               10,
    marginBottom:      12,
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
    marginBottom:   8,
  },
  h1: {
    fontFamily:    FONTS.sans,
    fontSize:      24,
    fontWeight:    'bold',
    color:         C.ink.primary,
    letterSpacing: -0.4,
    lineHeight:    1.08,
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
    lineHeight:  1.5,
  },
})

interface EditorialHeadlineProps {
  data: FitScoreReportData
}

export function EditorialHeadline({ data }: Readonly<EditorialHeadlineProps>) {
  const n = data.applicants.length
  const plural = n === 1 ? '' : 's'

  return (
    <View style={S.wrap}>
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
