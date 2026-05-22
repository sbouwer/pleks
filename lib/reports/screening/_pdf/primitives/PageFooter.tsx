/**
 * lib/reports/screening/_pdf/primitives/PageFooter.tsx
 *
 * Per-page footer: left = disclaimer + help URL + privacy URL, right = version string + hash.
 * Absolute-positioned so it sits at the bottom of every page without affecting content flow.
 * "How to Read" URL uses the version-specific path (interpretationVersion from data).
 * Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §E.1, §6.11.
 */

import { View, Text, StyleSheet } from "@react-pdf/renderer"
import { C, PAGE, sp } from "./theme"
import type { FitScoreReportData } from "./theme"

const BOTTOM = 22

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
    marginBottom:   10,
  },
  row: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'flex-end',
    gap:            16,
  },
  left: {
    flex: 1,
  },
  disclaim: {
    fontFamily:  'Inter Tight',
    fontSize:    7.5,
    color:       C.ink.mute,
    lineHeight:  1.55,
    marginBottom: 5,
  },
  disclaimPrefix: {
    fontFamily:  'JetBrains Mono',
    fontSize:    7,
    color:       C.ink.faint,
    letterSpacing: 0.8,
  },
  link: {
    fontFamily:  'JetBrains Mono',
    fontSize:    7,
    color:       C.ink.faint,
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  sig: {
    fontFamily:  'JetBrains Mono',
    fontSize:    7,
    color:       C.ink.faint,
    letterSpacing: 0.3,
    textAlign:   'right',
  },
  sigBold: {
    color: C.ink.mute,
  },
})

interface PageFooterProps {
  data: FitScoreReportData
}

export function PageFooter({ data }: Readonly<PageFooterProps>) {
  const appUrl      = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.pleks.co.za'
  // Strip https:// — the // digraph is a JetBrains Mono ligature whose glyph metrics
  // are malformed; fontkit crashes during layout. Display domain-only URL in footer.
  const displayHost = appUrl.replace(/^https?:\/\//, '')
  const helpUrl     = `${displayHost}/help/fitscore-report/${sp(data.interpretationVersion)}`
  // No trailing ... — the ... trigraph is also a JB ligature with broken metrics.
  const hashDisplay = `sha256:${sp(data.inputsHash).slice(0, 8)}`

  const versionLine = [
    `Engine: ${sp(data.engineVersion)}`,
    `Narr: ${sp(data.narrativeVersion)}`,
    `Interp: ${sp(data.interpretationVersion)}`,
    `Inputs: ${hashDisplay}`,
  ].join('  ·  ')

  return (
    <View style={S.footer} fixed>
      <View style={S.rule} />
      <View style={S.row}>
        <View style={S.left}>
          <Text style={S.disclaim}>
            <Text style={S.disclaimPrefix}>DISCLAIMER · </Text>
            This report is structured screening evidence. It does not constitute a tenancy
            recommendation or approval. The agent or landlord makes the tenancy decision.
          </Text>
          <Text style={S.link}>How to read this report: {helpUrl}</Text>
          <Text style={S.link}>POPIA access requests: privacy@pleks.co.za</Text>
        </View>

        <Text style={S.sig}>
          <Text style={S.sigBold}>{sp(data.orgName)}</Text>{'\n'}
          {versionLine}
        </Text>
      </View>
    </View>
  )
}
