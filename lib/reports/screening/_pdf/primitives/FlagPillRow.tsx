/**
 * lib/reports/screening/_pdf/primitives/FlagPillRow.tsx
 *
 * Horizontal row of material flag pill badges. Three visual types:
 * critical (solid dark border), capping (neutral), trust (dashed, muted).
 * Maps to .flags-row / .flag in HTML reference.
 * Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §E.2.
 */

import { View, Text, StyleSheet } from "@react-pdf/renderer"
import { C, sp } from "./theme"
import type { FitScoreReportData, MaterialFlag } from "./theme"

const S = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           6,
    marginBottom:  24,
  },
  pill: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               7,
    fontFamily:        'JetBrains Mono',
    fontSize:          7.5,
    letterSpacing:     0.5,
    paddingVertical:   4,
    paddingHorizontal: 10,
    borderWidth:       0.75,
    borderRadius:      2,
  },
  pillCritical: {
    borderColor:      C.ink.primary,
    backgroundColor:  C.surface.paper,
    color:            C.ink.primary,
  },
  pillCapping: {
    borderColor:      C.rule.strong,
    backgroundColor:  C.surface.paper,
    color:            C.ink.soft,
  },
  pillTrust: {
    borderColor:      C.data.base,
    backgroundColor:  C.data.wash,
    color:            C.ink.soft,
  },
  dot: {
    width:        5,
    height:       5,
    borderRadius: 999,
  },
  dotCritical: { backgroundColor: C.amber.base },
  dotCapping:  { backgroundColor: C.ink.ghost  },
  dotTrust:    { backgroundColor: C.data.soft  },
  empty: {
    fontFamily: 'Inter Tight',
    fontSize:   8.5,
    color:      C.ink.faint,
  },
})

function pillStyle(cls: MaterialFlag['class']) {
  if (cls === 'critical') return S.pillCritical
  if (cls === 'trust')    return S.pillTrust
  return S.pillCapping
}

function dotStyle(cls: MaterialFlag['class']) {
  if (cls === 'critical') return S.dotCritical
  if (cls === 'trust')    return S.dotTrust
  return S.dotCapping
}

function FlagPill({ flag }: Readonly<{ flag: MaterialFlag }>) {
  return (
    <View style={[S.pill, pillStyle(flag.class)]}>
      <View style={[S.dot, dotStyle(flag.class)]} />
      <Text>{sp(flag.description)}</Text>
    </View>
  )
}

interface FlagPillRowProps {
  data: FitScoreReportData
}

export function FlagPillRow({ data }: Readonly<FlagPillRowProps>) {
  if (data.materialFlags.length === 0) {
    return (
      <View style={S.wrap}>
        <Text style={S.empty}>No material flags on this application.</Text>
      </View>
    )
  }

  return (
    <View style={S.wrap}>
      {data.materialFlags.map((flag, i) => (
        <FlagPill key={`${flag.flag}-${i}`} flag={flag} />
      ))}
    </View>
  )
}
