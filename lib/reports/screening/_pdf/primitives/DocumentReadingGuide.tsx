/**
 * lib/reports/screening/_pdf/primitives/DocumentReadingGuide.tsx
 *
 * §5.1 — Static reading guide for the full FitScore document.
 * Explains what each section contains and how to navigate the report.
 * Carries the section 5 SectionHeader (first primitive in the Document Attestation shell).
 * No props — content is static doctrine. Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §E.4.
 */

import { View, Text, StyleSheet } from "@react-pdf/renderer"
import { C, D, FONTS } from "./theme"
import { SectionHeader } from "./SectionHeader"
import { BlockHeader }   from "./BlockHeader"

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
    flexDirection:   'row',
    paddingVertical: 10,
    paddingHorizontal: D.cardPaddingX,
    gap:             12,
    alignItems:      'flex-start',
  },
  rowLabel: {
    width:      32,
    fontFamily: FONTS.mono,
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
  doctrine: {
    fontFamily:  FONTS.sans,
    fontSize:    8,
    color:       C.ink.faint,
    lineHeight:  D.bodyLineHeight,
    paddingHorizontal: D.cardPaddingX,
    paddingVertical:   D.cardPaddingY,
    borderTopWidth:    0.75,
    borderTopColor:    C.rule.base,
  },
})

type GuideRow = { readonly label: string; readonly text: string }

const ROWS: readonly GuideRow[] = [
  {
    label: '§1',
    text:  'Profile. Composite score, band assignment, dimensional evidence bars, and the material flags that influenced the result.',
  },
  {
    label: '§2',
    text:  'Financial Analysis. Income reconciliation, expenditure breakdown, and the risk and uncertainty split that supports the affordability dimension.',
  },
  {
    label: '§3',
    text:  'Evidence and Credit. Bureau coverage matrix and verification check outcomes.',
  },
  {
    label: '§4',
    text:  'Assessment Narrative. Observed strengths, concerns, and limited-visibility notes from the assessment engine, followed by the synthesis paragraph.',
  },
  {
    label: '§5',
    text:  'Document Attestation. This reading guide and the document trail: version metadata, inputs hash, help URL, and POPIA contact.',
  },
]

export function DocumentReadingGuide() {
  return (
    <View style={S.wrap} wrap={false}>
      <SectionHeader badge="5" title="Document attestation" />
      <View style={S.card}>
        <BlockHeader label="5.1" title="Reading guide" />
        {ROWS.map((row, i) => (
          <View key={`${i}-${row.label}`} style={i === ROWS.length - 1 ? S.rowLast : S.row}>
            <Text style={S.rowLabel}>{row.label}</Text>
            <Text style={S.rowText}>{row.text}</Text>
          </View>
        ))}
        <Text style={S.doctrine}>
          The composite score is metadata for cross-report comparability. It is not a tenancy recommendation. Final tenancy decisions rest with the agent or landlord.
        </Text>
      </View>
    </View>
  )
}
