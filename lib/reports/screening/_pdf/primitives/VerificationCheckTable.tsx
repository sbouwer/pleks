/**
 * lib/reports/screening/_pdf/primitives/VerificationCheckTable.tsx
 *
 * §3.2 — Verification integrity panel: primary check table with outcome states.
 * Renders when data.creditAnalysis is present; PENDING otherwise.
 * Outcome types: pass = consistent/verified, partial = partial, absent = NOT SOLICITED.
 * Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §E.3.
 */

import { View, Text, StyleSheet } from "@react-pdf/renderer"
import { C, D, FONTS, sp } from "./theme"
import type { FitScoreReportData, VerificationCheckItem, VerificationOutcome } from "./theme"
import { SectionHeader }   from "./SectionHeader"
import { BlockHeader }     from "./BlockHeader"
import { PlaceholderCard } from "./PlaceholderCard"

const S = StyleSheet.create({
  wrap:  { marginBottom: D.primitiveGap },
  block: {
    borderWidth:     0.75,
    borderColor:     C.rule.base,
    backgroundColor: C.surface.paperRaised,
    marginBottom:    D.primitiveGapTight,
  },
  blockBody: {
    paddingHorizontal: D.cardPaddingX,
    paddingVertical:   D.cardPaddingY,
  },

  tableHead: {
    flexDirection:     'row',
    paddingVertical:   6,
    borderBottomWidth: 0.75,
    borderBottomColor: C.rule.strong,
    marginBottom:      2,
  },
  tableRow: {
    flexDirection:     'row',
    paddingVertical:   9,
    borderBottomWidth: 0.75,
    borderBottomColor: C.rule.base,
    alignItems:        'flex-start',
  },
  tableRowLast: { borderBottomWidth: 0 },

  colCheck:   { flex: 1.4 },
  colSource:  { flex: 1.2 },
  colMethod:  { flex: 1.2 },
  colOutcome: { flex: 1.2 },

  th: {
    fontFamily:    FONTS.mono,
    fontSize:      6.5,
    letterSpacing: 0.8,
    color:         C.ink.mute,
    textTransform: 'uppercase',
  },
  td: {
    fontFamily: FONTS.sans,
    fontSize:   8.5,
    color:      C.ink.primary,
    lineHeight: 1.4,
  },
  tdSub: {
    fontFamily:    FONTS.mono,
    fontSize:      7,
    letterSpacing: 0.3,
    color:         C.ink.faint,
    marginTop:     2,
  },
  tdMuted: { color: C.ink.mute },

  // Outcome state tags
  outcomeWrap: { gap: 3 },
  outcomeTag: {
    fontFamily:        FONTS.mono,
    fontSize:          7,
    letterSpacing:     0.5,
    paddingHorizontal: 5,
    paddingVertical:   2,
    borderRadius:      2,
    borderWidth:       0.75,
    alignSelf:         'flex-start',
  },
  outcomePass:    { color: C.data.base,   borderColor: C.data.soft,   backgroundColor: C.data.wash   },
  outcomePartial: { color: C.amber.ink,   borderColor: C.amber.base,  backgroundColor: C.amber.wash  },
  outcomeAbsent:  { color: C.ink.mute,    borderColor: C.rule.strong, backgroundColor: C.surface.paperSunk },
  outcomeNote: {
    fontFamily:    FONTS.mono,
    fontSize:      6.5,
    letterSpacing: 0.3,
    color:         C.ink.faint,
    lineHeight:    1.55,
    marginTop:     2,
  },
})

function outcomeStyle(t: VerificationOutcome) {
  if (t === 'pass')    return S.outcomePass
  if (t === 'partial') return S.outcomePartial
  return S.outcomeAbsent
}
function outcomeTagLabel(t: VerificationOutcome): string {
  if (t === 'pass')    return 'Consistent'
  if (t === 'partial') return 'Partial'
  return 'Not solicited'
}

function CheckRow({ item, isLast }: Readonly<{ item: VerificationCheckItem; isLast: boolean }>) {
  return (
    <View style={isLast ? S.tableRowLast : S.tableRow}>
      <View style={S.colCheck}>
        <Text style={S.td}>{sp(item.checkName)}</Text>
        <Text style={S.tdSub}>{sp(item.checkSub)}</Text>
      </View>
      <View style={S.colSource}>
        <Text style={item.source === '—' ? [S.td, S.tdMuted] : S.td}>{sp(item.source)}</Text>
      </View>
      <View style={S.colMethod}>
        <Text style={item.method === '—' ? [S.td, S.tdMuted] : S.td}>{sp(item.method)}</Text>
      </View>
      <View style={S.colOutcome}>
        <View style={S.outcomeWrap}>
          <Text style={[S.outcomeTag, outcomeStyle(item.outcomeType)]}>{outcomeTagLabel(item.outcomeType)}</Text>
          {item.outcomeLabel !== '' && (
            <Text style={S.td}>{sp(item.outcomeLabel)}</Text>
          )}
          {item.evidenceNote !== '' && (
            <Text style={S.outcomeNote}>{sp(item.evidenceNote)}</Text>
          )}
        </View>
      </View>
    </View>
  )
}

interface VerificationCheckTableProps {
  data: FitScoreReportData
}

export function VerificationCheckTable({ data }: Readonly<VerificationCheckTableProps>) {
  const ca = data.creditAnalysis
  const checksLabel = ca
    ? `${ca.verificationsLabel} · ${ca.verificationsQueryLabel}`
    : sp(data.dimensions.verification.checksPassedDisplay)

  return (
    <View style={S.wrap} wrap={false}>
      <SectionHeader
        badge="3.2"
        title="Verification integrity panel"
        rightLabel="Evidentiary consistency · not engine confidence"
      />

      <View style={S.block}>
        <BlockHeader
          label="3.2.A"
          title={`Primary checks · ${checksLabel}`}
          rightTag="queried via Pleks broker"
        />
        <View style={S.blockBody}>
          {ca === undefined ? (
            <PlaceholderCard
              variant="pending"
              message={
                'Detailed verification check outcomes pending expanded verification data. ' +
                'Check counts are available on page 1 in the Verification Integrity dimension card.'
              }
            />
          ) : (
            <>
              <View style={S.tableHead}>
                <Text style={[S.th, S.colCheck]}>Check</Text>
                <Text style={[S.th, S.colSource]}>Source</Text>
                <Text style={[S.th, S.colMethod]}>Method</Text>
                <Text style={[S.th, S.colOutcome]}>Outcome</Text>
              </View>
              {ca.verificationChecks.map((item, i) => (
                <CheckRow
                  key={`${i}-${item.checkName.slice(0, 12)}`}
                  item={item}
                  isLast={i === ca.verificationChecks.length - 1}
                />
              ))}
            </>
          )}
        </View>
      </View>
    </View>
  )
}
