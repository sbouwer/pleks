/**
 * lib/reports/screening/_pdf/primitives/RunningHeader.tsx
 *
 * Per-page header: left = document identity (applicant + ref + section), right = page counter.
 * Last page shows "· END" suffix on the counter to mark document close.
 * DocumentShell passes applicantName and applicationRef from data automatically.
 * Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §E.1.
 */

import { View, Text, StyleSheet } from "@react-pdf/renderer"
import { C, FONTS, sp } from "./theme"

const S = StyleSheet.create({
  header: {
    flexDirection:     'row',
    justifyContent:    'space-between',
    alignItems:        'flex-end',
    paddingBottom:     10,
    marginBottom:      16,
    borderBottomWidth: 1,
    borderBottomColor: C.rule.base,
  },
  meta: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           8,
    fontFamily:    FONTS.mono,
    fontSize:      7.5,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color:         C.ink.mute,
  },
  metaSep: {
    width:            1,
    height:           8,
    backgroundColor:  C.rule.strong,
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
    fontFamily:    FONTS.mono,
    fontSize:      7.5,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color:         C.ink.mute,
  },
  pagenoN: {
    color:           C.ink.primary,
    fontWeight:      'normal',
    borderLeftWidth: 1.5,
    borderLeftColor: C.amber.base,
    paddingLeft:     6,
  },
})

interface RunningHeaderProps {
  section:       string
  applicantName: string
  applicationRef: string
}

export function RunningHeader({ section, applicantName, applicationRef }: Readonly<RunningHeaderProps>) {
  return (
    <View style={S.header} fixed>
      <View style={S.meta}>
        <Text style={S.metaBold}>PLEKS</Text>
        <View style={S.metaSep} />
        <Text style={S.metaBold}>{sp(applicantName).toUpperCase()}</Text>
        <View style={S.metaSep} />
        <Text>{sp(applicationRef).toUpperCase()}</Text>
        <View style={S.metaSep} />
        <Text>{section.toUpperCase()}</Text>
      </View>

      <View style={S.pageno}>
        <Text>PAGE</Text>
        <Text
          style={S.pagenoN}
          render={({ pageNumber, totalPages }) =>
            pageNumber === totalPages
              ? `${pageNumber} / ${totalPages} · END`
              : `${pageNumber} / ${totalPages}`
          }
        />
      </View>
    </View>
  )
}
