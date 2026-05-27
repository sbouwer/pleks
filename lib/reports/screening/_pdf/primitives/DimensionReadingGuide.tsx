/**
 * lib/reports/screening/_pdf/primitives/DimensionReadingGuide.tsx
 *
 * Static doctrine card placed after DimensionCardEditorial.
 * Explains the bar, qual headline, and observations fields to the reviewer.
 * No props — content is static doctrine. Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §E.2.
 */

import { View, Text, StyleSheet } from "@react-pdf/renderer"
import { C, D, FONTS } from "./theme"
import type { FitScoreReportData } from "./theme"
import { BlockHeader } from "./BlockHeader"

const S = StyleSheet.create({
  wrap: { marginBottom: D.primitiveGap },
  card: {
    borderWidth:     0.75,
    borderColor:     C.rule.base,
    backgroundColor: C.surface.paperRaised,
    paddingBottom:   0,
  },
  row: {
    flexDirection:     'row',
    paddingVertical:   10,
    paddingHorizontal: D.cardPaddingX,
    borderBottomWidth: 0.75,
    borderBottomColor: C.rule.base,
    gap:               12,
    alignItems:        'flex-start',
  },
  rowLast: {
    flexDirection:     'row',
    paddingVertical:   10,
    paddingHorizontal: D.cardPaddingX,
    gap:               12,
    alignItems:        'flex-start',
  },
  rowLabel: {
    width:      80,
    fontFamily: FONTS.sans,
    fontSize:   8.5,
    fontWeight: 'bold',
    color:      C.ink.primary,
    lineHeight: D.bodyLineHeight,
  },
  rowText: {
    flex:       1,
    fontFamily: FONTS.sans,
    fontSize:   8.5,
    color:      C.ink.mute,
    lineHeight: D.bodyLineHeight,
  },
})

type GuideRow = { readonly label: string; readonly text: string }

const ROWS: readonly GuideRow[] = [
  {
    label: 'The bar',
    text:  'Shows the applicant\'s dimensional score (0-100) with a threshold marker. Scores above the marker sit within the preferred range for this profile class.',
  },
  {
    label: 'The qual headline',
    text:  'Summarises the engine\'s primary signal for each dimension. Algorithmic output - read alongside the observations, not in isolation.',
  },
  {
    label: 'The observations',
    text:  'Analyst-facing notes derived from the same evidence the engine used. They surface data points the score alone cannot fully represent.',
  },
]

export function DimensionReadingGuide({ data }: Readonly<{ data: FitScoreReportData }>) {
  if (data.isLdp) return null
  return (
    <View style={S.wrap} wrap={false}>
      <View style={S.card}>
        <BlockHeader label="—" title="Reading guide · Dimensions" rightTag={data.isAllForeignNational ? "How to read the three dimension cards above" : "How to read the four dimension cards above"} />
        {ROWS.map((row, i) => (
          <View key={`${i}-${row.label.slice(0, 8)}`} style={i === ROWS.length - 1 ? S.rowLast : S.row}>
            <Text style={S.rowLabel}>{row.label}</Text>
            <Text style={S.rowText}>{row.text}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}
