/**
 * lib/reports/screening/_pdf/primitives/DocumentReadingGuide.tsx
 *
 * §4.3 — Static reading guide for the full FitScore document.
 * Explains what each section contains and how to navigate the report.
 * No props — content is static doctrine. Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §E.4.
 */

import { View, Text, StyleSheet } from "@react-pdf/renderer"
import { C, D, FONTS } from "./theme"

const S = StyleSheet.create({
  wrap: { marginBottom: D.primitiveGap },
  card: {
    borderWidth:       0.75,
    borderColor:       C.rule.base,
    paddingHorizontal: D.cardPaddingX,
    paddingTop:        D.cardPaddingY,
    paddingBottom:     0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           10,
    marginBottom:  8,
  },
  title: {
    fontFamily:    FONTS.mono,
    fontSize:      7.5,
    letterSpacing: 1,
    color:         C.ink.mute,
    textTransform: 'uppercase',
  },
  intro: {
    fontFamily: FONTS.sans,
    fontSize:   8.5,
    color:      C.ink.mute,
    lineHeight: D.bodyLineHeight,
  },
  row: {
    flexDirection:     'row',
    paddingVertical:   10,
    borderBottomWidth: 0.75,
    borderBottomColor: C.rule.base,
    gap:               12,
    alignItems:        'flex-start',
  },
  rowLast: {
    flexDirection:   'row',
    paddingVertical: 10,
    gap:             12,
    alignItems:      'flex-start',
  },
  rowLabel: {
    width:      80,
    fontFamily: FONTS.sans,
    fontSize:   9,
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
    label: 'Section 1',
    text:  'Profile. Composite score, band assignment, dimensional evidence bars, and the material flags that influenced the result.',
  },
  {
    label: 'Section 2',
    text:  'Financial Analysis. Income reconciliation, expenditure breakdown, and the risk/uncertainty split that supports the affordability dimension.',
  },
  {
    label: 'Section 3',
    text:  'Evidence and Credit. Bureau coverage matrix, verification check outcomes, and the attestation confirming what data Pleks received.',
  },
  {
    label: 'Section 4',
    text:  'Narrative. Observed strengths, concerns, and limited-visibility notes from the assessment engine. Followed by the synthesis paragraph and document attestation.',
  },
]

export function DocumentReadingGuide() {
  return (
    <View style={S.wrap} wrap={false}>
      <View style={S.card}>
        <View style={S.titleRow}>
          <Text style={S.title}>Reading guide · Document</Text>
          <Text style={S.intro}>What each section of this report contains.</Text>
        </View>
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
