/**
 * lib/reports/screening/_pdf/primitives/SectionHeader.tsx
 *
 * Section heading with mono oval badge (left), large h2 (centre), optional mono right label.
 * Bold bottom border with a short amber accent starting at ~36% — matches HTML .sec-h::after.
 * In react-pdf we approximate the ::after with an absolutely-positioned amber View.
 * Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §E.1.
 */

import { View, Text, StyleSheet } from "@react-pdf/renderer"
import { C, FONTS, T } from "./theme"

const S = StyleSheet.create({
  wrap: {
    flexDirection:    'row',
    alignItems:       'flex-end',
    gap:              12,
    marginBottom:     18,
    paddingBottom:    10,
    borderBottomWidth: 1.5,
    borderBottomColor: C.ink.primary,
    position:         'relative',
  },
  // Amber accent bar overlaid on the bottom border, ~36% from left, 8% wide.
  // Rendered as a 1.5pt-tall coloured strip offset from the parent's padding-bottom.
  accentBar: {
    position:        'absolute',
    bottom:          -1,
    left:            '36%',
    width:           '8%',
    height:          1.5,
    backgroundColor: C.amber.base,
  },
  badge: {
    fontFamily:      FONTS.mono,
    fontSize:        7.5,
    letterSpacing:   1,
    textTransform:   'uppercase',
    color:           C.ink.mute,
    borderWidth:     0.75,
    borderColor:     C.rule.strong,
    borderRadius:    999,
    paddingVertical: 2,
    paddingHorizontal: 7,
  },
  title: {
    ...T.h2,
    flex: 1,
  },
  rightLabel: {
    fontFamily:   FONTS.mono,
    fontSize:     7.5,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color:        C.ink.faint,
  },
})

interface SectionHeaderProps {
  badge:      string
  title:      string
  rightLabel?: string
}

export function SectionHeader({ badge, title, rightLabel }: Readonly<SectionHeaderProps>) {
  return (
    <View style={S.wrap}>
      <Text style={S.badge}>{badge}</Text>
      <Text style={S.title}>{title}</Text>
      {rightLabel && <Text style={S.rightLabel}>{rightLabel}</Text>}
      <View style={S.accentBar} />
    </View>
  )
}
