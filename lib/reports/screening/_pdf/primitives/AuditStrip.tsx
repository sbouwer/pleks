/**
 * lib/reports/screening/_pdf/primitives/AuditStrip.tsx
 *
 * Dark-ink strip that appears once, at the top of page 1 only, above the RunningHeader.
 * Extends edge-to-edge via negative horizontal margins (matches HTML .strip full-bleed).
 * Shows breadcrumbs on the left, versioning metadata on the right.
 * Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §E.1.
 */

import { View, Text, StyleSheet } from "@react-pdf/renderer"
import { C, FONTS, PAGE, sp } from "./theme"
import type { FitScoreReportData } from "./theme"

const S = StyleSheet.create({
  strip: {
    // Negative margins cancel the page's paddingHorizontal and paddingTop to bleed to paper edge.
    marginTop:        -PAGE.paddingTop,
    marginHorizontal: -PAGE.paddingHorizontal,
    paddingTop:        PAGE.paddingTop,
    paddingHorizontal: PAGE.paddingHorizontal,
    paddingVertical:   9,
    backgroundColor:   C.ink.primary,
    flexDirection:     'row',
    justifyContent:    'space-between',
    alignItems:        'center',
    marginBottom:      24,
  },
  crumbs: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           8,
    fontFamily:    FONTS.mono,
    fontSize:      8,
    letterSpacing: 1,
  },
  crumbMute: {
    color: C.ink.faint,
  },
  crumbSep: {
    color: '#3e4260',  // ink-soft on dark bg
  },
  crumbBold: {
    color: C.surface.paper,
    fontWeight: 'normal',
  },
  right: {
    flexDirection: 'row',
    gap:           14,
    fontFamily:    FONTS.mono,
    fontSize:      7.5,
    color:         C.ink.faint,
    letterSpacing: 0.5,
  },
  rightSeg: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           4,
  },
  rightLabel: {
    color: '#5a5e80',  // slightly lighter than inkMute on dark bg
  },
  rightValue: {
    color: C.surface.paperSunk,
  },
})

interface AuditStripProps {
  data: FitScoreReportData
}

export function AuditStrip({ data }: Readonly<AuditStripProps>) {
  const hashDisplay = `${sp(data.inputsHash).slice(0, 8)}`

  return (
    <View style={S.strip}>
      <View style={S.crumbs}>
        <Text style={S.crumbMute}>PLEKS</Text>
        <Text style={S.crumbSep}>·</Text>
        <Text style={S.crumbBold}>FITSCORE REPORT</Text>
        <Text style={S.crumbSep}>·</Text>
        <Text style={S.crumbMute}>{sp(data.applicationRef)}</Text>
      </View>

      <View style={S.right}>
        <View style={S.rightSeg}>
          <Text style={S.rightLabel}>ENGINE</Text>
          <Text style={S.rightValue}>{sp(data.engineVersion)}</Text>
        </View>
        <View style={S.rightSeg}>
          <Text style={S.rightLabel}>NARR</Text>
          <Text style={S.rightValue}>{sp(data.narrativeVersion)}</Text>
        </View>
        <View style={S.rightSeg}>
          <Text style={S.rightLabel}>HASH</Text>
          <Text style={S.rightValue}>{hashDisplay}</Text>
        </View>
      </View>
    </View>
  )
}
