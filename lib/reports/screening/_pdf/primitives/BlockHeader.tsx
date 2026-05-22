/**
 * lib/reports/screening/_pdf/primitives/BlockHeader.tsx
 *
 * Data-block heading row: mono uppercase label (left), h3 title, optional mono right tag.
 * Matches HTML .block-h — used for card-style evidence blocks on pages 2–3.
 * Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §E.1.
 */

import { View, Text, StyleSheet } from "@react-pdf/renderer"
import { C, T } from "./theme"

const S = StyleSheet.create({
  wrap: {
    flexDirection:    'row',
    alignItems:       'center',
    gap:              10,
    paddingVertical:  10,
    paddingHorizontal: 16,
    borderBottomWidth: 0.75,
    borderBottomColor: C.rule.base,
    backgroundColor:   C.surface.paperSunk,
  },
  label: {
    fontFamily:   'JetBrains Mono',
    fontSize:     7.5,
    letterSpacing: 1.0,
    textTransform: 'uppercase',
    color:         C.ink.mute,
  },
  title: {
    ...T.h3,
    flex: 1,
  },
  rightTag: {
    fontFamily:   'JetBrains Mono',
    fontSize:     7.5,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color:         C.ink.faint,
  },
})

interface BlockHeaderProps {
  label:     string
  title:     string
  rightTag?: string
}

export function BlockHeader({ label, title, rightTag }: Readonly<BlockHeaderProps>) {
  return (
    <View style={S.wrap}>
      <Text style={S.label}>{label}</Text>
      <Text style={S.title}>{title}</Text>
      {rightTag && <Text style={S.rightTag}>{rightTag}</Text>}
    </View>
  )
}
