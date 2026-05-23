/**
 * lib/reports/screening/_pdf/primitives/PageFooter.tsx
 *
 * Per-page footer: one-line disclaimer, one-line page counter.
 * Help URL and POPIA email migrated to AttestationCard (body, last page only).
 * Absolute-positioned so it sits at the bottom of every page without affecting content flow.
 * Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §E.3 density retune.
 */

import { View, Text, StyleSheet } from "@react-pdf/renderer"
import { C, D, FONTS, PAGE, sp } from "./theme"
import type { FitScoreReportData } from "./theme"

const BOTTOM = 18

const S = StyleSheet.create({
  footer: {
    position: 'absolute',
    bottom:   BOTTOM,
    left:     PAGE.paddingHorizontal,
    right:    PAGE.paddingHorizontal,
  },
  rule: {
    borderTopWidth: 0.75,
    borderTopColor: C.rule.base,
    marginBottom:   6,
  },
  disclaim: {
    fontFamily:   FONTS.sans,
    fontSize:     7,
    color:        C.ink.mute,
    lineHeight:   D.footerLineHeight,
    marginBottom: 3,
  },
  disclaimPrefix: {
    fontFamily:    FONTS.mono,
    fontSize:      6.5,
    color:         C.ink.faint,
    letterSpacing: 0.8,
  },
  pageRef: {
    fontFamily:    FONTS.mono,
    fontSize:      7,
    color:         C.ink.faint,
    letterSpacing: 0.3,
    textAlign:     'right',
  },
})

interface PageFooterProps {
  data: FitScoreReportData
}

export function PageFooter({ data }: Readonly<PageFooterProps>) {
  return (
    <View style={S.footer} fixed>
      <View style={S.rule} />
      <Text style={S.disclaim}>
        <Text style={S.disclaimPrefix}>DISCLAIMER · </Text>
        This report is structured screening evidence. The agent or landlord makes the tenancy decision.
      </Text>
      <Text
        style={S.pageRef}
        render={({ pageNumber, totalPages }) =>
          `${sp(data.applicationRef)} · PAGE ${pageNumber} · ${totalPages}`
        }
      />
    </View>
  )
}
