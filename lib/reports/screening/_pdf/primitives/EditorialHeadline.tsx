/**
 * lib/reports/screening/_pdf/primitives/EditorialHeadline.tsx
 *
 * Page 1 hero block: eyebrow pill, large band-name headline, unit-label subtitle.
 * Maps to .doc-title-row + .eyebrow-inline + h1.doc-title + .doc-sub in HTML reference.
 * Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §E.2.
 */

import { View, Text, StyleSheet } from "@react-pdf/renderer"
import { C, BAND_LABELS, sp, fmtDate } from "./theme"
import type { FitScoreReportData } from "./theme"

const S = StyleSheet.create({
  wrap: {
    marginBottom: 24,
  },
  eyebrow: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            10,
    marginBottom:   12,
    borderWidth:    0.75,
    borderColor:    C.rule.base,
    borderRadius:   999,
    alignSelf:      'flex-start',
    paddingVertical: 4,
    paddingHorizontal: 10,
    backgroundColor: C.surface.paperSunk,
  },
  eyebrowText: {
    fontFamily:    'JetBrains Mono',
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
    fontFamily:    'Inter Tight',
    fontSize:      24,
    fontWeight:    'bold',
    color:         C.ink.primary,
    letterSpacing: -0.4,
    lineHeight:    1.08,
    flex:          1,
  },
  dateBlock: {
    fontFamily:    'JetBrains Mono',
    fontSize:      7.5,
    color:         C.ink.faint,
    letterSpacing: 0.5,
    textAlign:     'right',
    paddingBottom:  2,
  },
  sub: {
    fontFamily:  'Inter Tight',
    fontSize:    10.5,
    color:       C.ink.soft,
    lineHeight:  1.5,
  },
})

interface EditorialHeadlineProps {
  data: FitScoreReportData
}

export function EditorialHeadline({ data }: Readonly<EditorialHeadlineProps>) {
  return (
    <View style={S.wrap}>
      <View style={S.eyebrow}>
        <Text style={S.eyebrowText}>FitScore Report</Text>
        <View style={S.eyebrowSep} />
        <Text style={S.eyebrowText}>{sp(data.applicationRef)}</Text>
      </View>

      <View style={S.titleRow}>
        <Text style={S.h1}>{sp(BAND_LABELS[data.band] ?? data.band)}</Text>
        <Text style={S.dateBlock}>
          {'Generated\n'}{sp(fmtDate(data.generatedAt))}
        </Text>
      </View>

      <Text style={S.sub}>{sp(data.unitLabel)}</Text>
    </View>
  )
}
