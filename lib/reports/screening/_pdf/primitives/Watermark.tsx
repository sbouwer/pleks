/**
 * lib/reports/screening/_pdf/primitives/Watermark.tsx
 *
 * Renders once per page — absolute top-right corner, outside the content flow.
 * DocumentShell includes this on every page; no prop needed.
 * Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §E.1.
 */

import { View, Text, StyleSheet } from "@react-pdf/renderer"
import { C } from "./theme"

const S = StyleSheet.create({
  mark: {
    position: 'absolute',
    top: 16,
    right: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.amber.base,
  },
  text: {
    fontFamily: 'JetBrains Mono',
    fontSize: 7,
    color: C.ink.faint,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
})

export function Watermark() {
  return (
    <View style={S.mark} fixed>
      <View style={S.dot} />
      <Text style={S.text}>PLEKS · EVIDENCE REPORT · CONFIDENTIAL</Text>
    </View>
  )
}
