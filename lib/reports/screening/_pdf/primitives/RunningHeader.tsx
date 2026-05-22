/**
 * lib/reports/screening/_pdf/primitives/RunningHeader.tsx
 *
 * Per-page header: left = "PLEKS · FITSCORE REPORT · {section}", right = amber-bordered page counter.
 * Rendered by DocumentShell on every page, below the AuditStrip on page 1.
 * Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §E.1.
 */

import { View, Text, StyleSheet } from "@react-pdf/renderer"
import { C } from "./theme"

const S = StyleSheet.create({
  header: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'flex-end',
    paddingBottom:  14,
    marginBottom:   28,
    borderBottomWidth: 1,
    borderBottomColor: C.rule.base,
  },
  meta: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           8,
    fontFamily:    'JetBrains Mono',
    fontSize:      7.5,
    letterSpacing: 1.0,
    textTransform: 'uppercase',
    color:         C.ink.mute,
  },
  metaSep: {
    width:           1,
    height:          8,
    backgroundColor: C.rule.strong,
    marginHorizontal: 2,
  },
  metaBold: {
    color:      C.ink.primary,
    fontWeight: 'normal',
  },
  pageno: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           8,
    fontFamily:    'JetBrains Mono',
    fontSize:      7.5,
    letterSpacing: 1.0,
    textTransform: 'uppercase',
    color:         C.ink.mute,
  },
  pagenoN: {
    color:          C.ink.primary,
    fontWeight:     'normal',
    borderLeftWidth: 1.5,
    borderLeftColor: C.amber.base,
    paddingLeft:     6,
  },
})

interface RunningHeaderProps {
  section: string
}

export function RunningHeader({ section }: Readonly<RunningHeaderProps>) {
  return (
    <View style={S.header}>
      <View style={S.meta}>
        <Text style={S.metaBold}>PLEKS</Text>
        <View style={S.metaSep} />
        <Text>FITSCORE REPORT</Text>
        <View style={S.metaSep} />
        <Text>{section.toUpperCase()}</Text>
      </View>

      <View style={S.pageno}>
        <Text>PAGE</Text>
        <Text
          style={S.pagenoN}
          render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
        />
      </View>
    </View>
  )
}
