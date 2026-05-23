/**
 * lib/reports/screening/_pdf/primitives/AssessmentSynthesis.tsx
 *
 * §4.2 — Deterministic synthesis paragraph generated from the scoring data.
 * No AI call; output is fully reproducible from the report data alone.
 * Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §E.4.
 */

import { View, Text, StyleSheet } from "@react-pdf/renderer"
import { C, D, FONTS } from "./theme"
import type { FitScoreReportData } from "./theme"
import { BlockHeader } from "./BlockHeader"
import { buildSynthesis } from "@/lib/screening/prompts/synthesisTemplate.v1.0.2"

const S = StyleSheet.create({
  wrap: { marginBottom: D.primitiveGap },
  card: {
    borderWidth:     0.75,
    borderColor:     C.rule.base,
    backgroundColor: C.surface.paperRaised,
  },
  body: {
    paddingHorizontal: D.cardPaddingX,
    paddingTop:        D.cardPaddingY,
    paddingBottom:     D.cardPaddingY,
  },
  synthesis: {
    fontFamily: FONTS.sans,
    fontSize:   9.5,
    color:      C.ink.primary,
    lineHeight: D.bodyLineHeight,
    marginBottom: 10,
  },
  xref: {
    fontFamily:    FONTS.mono,
    fontSize:      7,
    color:         C.ink.faint,
    letterSpacing: 0.3,
  },
})

interface AssessmentSynthesisProps {
  data: FitScoreReportData
}

export function AssessmentSynthesis({ data }: Readonly<AssessmentSynthesisProps>) {
  return (
    <View style={S.wrap} wrap={false}>
      <View style={S.card}>
        <BlockHeader label="4.2" title="Assessment synthesis" />
        <View style={S.body}>
          <Text style={S.synthesis}>{buildSynthesis(data)}</Text>
          <Text style={S.xref}>Observed concerns and limited visibility are detailed in §2.3.</Text>
        </View>
      </View>
    </View>
  )
}
