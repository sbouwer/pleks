/**
 * lib/reports/screening/_pdf/primitives/BureauCoverageMatrix.tsx
 *
 * §3.1 — Bureau coverage matrix (3.1.A) and divergence axis (3.1.B).
 * Renders when data.creditAnalysis is present; PENDING otherwise.
 * Coverage pips: 0–5 filled squares. Divergence axis: 300–800 score range.
 * Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §E.3.
 */

import { View, Text, StyleSheet } from "@react-pdf/renderer"
import { C, D, FONTS, sp } from "./theme"

const A4_WIDTH_PT  = 595
const AXIS_LABEL_W = 20
import type { FitScoreReportData, BureauEntry } from "./theme"
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

  // Bureau table
  tableHead: {
    flexDirection:     'row',
    paddingHorizontal: 0,
    paddingVertical:   6,
    borderBottomWidth: 0.75,
    borderBottomColor: C.rule.strong,
    marginBottom:      2,
  },
  tableRow: {
    flexDirection:     'row',
    paddingVertical:   8,
    borderBottomWidth: 0.75,
    borderBottomColor: C.rule.base,
    alignItems:        'flex-start',
  },
  tableRowLast: { borderBottomWidth: 0 },

  colBureau:  { flex: 1.4 },
  colCov:     { flex: 1.6 },
  colTrade:   { flex: 1 },
  colAdverse: { flex: 1.3 },
  colScore:   { width: 52, alignItems: 'flex-end' },

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
  tdScore: {
    fontFamily:    FONTS.mono,
    fontSize:      9.5,
    letterSpacing: 0.3,
    color:         C.ink.primary,
    textAlign:     'right',
  },
  tdScoreAbsent: { color: C.ink.ghost },

  // Coverage pips
  pipRow:   { flexDirection: 'row', gap: 2, marginTop: 3 },
  pip:      { width: 6, height: 6, borderRadius: 1 },
  pipFull:  { backgroundColor: C.data.base },
  pipEmpty: { backgroundColor: C.surface.paperDeeper, borderWidth: 0.5, borderColor: C.rule.strong },

  // Observation note
  obsNote: {
    marginTop:      10,
    paddingTop:     10,
    borderTopWidth: 0.75,
    borderTopColor: C.rule.base,
    borderStyle:    'dashed',
  },
  obsText: {
    fontFamily:    FONTS.mono,
    fontSize:      7.5,
    color:         C.ink.mute,
    letterSpacing: 0.3,
    lineHeight:    1.65,
  },
  obsInk: { color: C.ink.primary },

  // Divergence axis
  divWrap: {
    marginTop:  10,
    paddingTop: 14,
  },
  divHeadRow: {
    flexDirection:  'row',
    alignItems:     'baseline',
    justifyContent: 'space-between',
    marginBottom:   10,
  },
  divRef: {
    fontFamily:    FONTS.mono,
    fontSize:      7.5,
    letterSpacing: 0.8,
    color:         C.ink.mute,
  },
  divPts: {
    fontFamily:    FONTS.mono,
    fontSize:      9.5,
    color:         C.ink.primary,
    letterSpacing: 0.3,
  },

  axisWrap: { position: 'relative', height: 28, marginBottom: 6 },
  axisTrack: {
    position:        'absolute',
    top:             12,
    left:            0,
    right:           0,
    height:          1,
    backgroundColor: C.rule.strong,
  },
  axisSpread: {
    position:        'absolute',
    top:             10,
    height:          5,
    backgroundColor: C.data.wash,
    borderWidth:     0.75,
    borderColor:     C.data.soft,
  },
  axisMarkerLine: {
    position:        'absolute',
    top:             6,
    width:           1,
    height:          12,
    backgroundColor: C.data.base,
  },
  axisLabel: {
    position:      'absolute',
    top:           0,
    width:         AXIS_LABEL_W,
    fontFamily:    FONTS.mono,
    fontSize:      6.5,
    color:         C.ink.primary,
    textAlign:     'center',
    letterSpacing: 0.3,
  },

  axisScaleRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
  },
  axisTick: {
    fontFamily:    FONTS.mono,
    fontSize:      6.5,
    color:         C.ink.faint,
    letterSpacing: 0.3,
  },

  divNote: {
    fontFamily:  FONTS.sans,
    fontSize:    8.5,
    color:       C.ink.mute,
    lineHeight:  D.bodyLineHeight,
    marginTop:   8,
  },
  divNoteBold: { color: C.ink.primary, fontWeight: 'bold' },
})

function CoveragePips({ filled }: Readonly<{ filled: number }>) {
  return (
    <View style={S.pipRow}>
      {[0, 1, 2, 3, 4].map(i => (
        <View key={`pip-${i}`} style={[S.pip, i < filled ? S.pipFull : S.pipEmpty]} />
      ))}
    </View>
  )
}

function BureauRow({ entry, isLast }: Readonly<{ entry: BureauEntry; isLast: boolean }>) {
  const hasScore = entry.reportedScore !== null
  return (
    <View style={isLast ? [S.tableRow, S.tableRowLast] : S.tableRow}>
      <View style={S.colBureau}>
        <Text style={S.td}>{sp(entry.name)}</Text>
        <Text style={S.tdSub}>{sp(entry.subLabel)}</Text>
      </View>
      <View style={S.colCov}>
        <CoveragePips filled={entry.coveragePips} />
        <Text style={[S.tdSub, { marginTop: 4 }]}>{sp(entry.coverageLabel)}</Text>
      </View>
      <View style={S.colTrade}>
        <Text style={entry.tradeLines === '—' ? [S.td, S.tdMuted] : S.td}>{sp(entry.tradeLines)}</Text>
      </View>
      <View style={S.colAdverse}>
        <Text style={entry.adverseListings === '—' ? [S.td, S.tdMuted] : S.td}>{sp(entry.adverseListings)}</Text>
      </View>
      <View style={S.colScore}>
        <Text style={hasScore ? S.tdScore : [S.tdScore, S.tdScoreAbsent]}>
          {hasScore ? String(entry.reportedScore) : '-'}
        </Text>
      </View>
    </View>
  )
}

function DivergenceAxis({ entries }: Readonly<{ entries: BureauEntry[] }>) {
  const scored = entries.filter((e): e is BureauEntry & { reportedScore: number } => e.reportedScore !== null)
  if (scored.length < 2) return null

  const scores      = scored.map(e => e.reportedScore)
  const minScore    = Math.min(...scores)
  const maxScore    = Math.max(...scores)
  const pts         = maxScore - minScore
  const axisW       = A4_WIDTH_PT - 2 * D.pagePaddingX
  const toPos       = (s: number) => `${((s - 300) / 500) * 100}%`
  const toLabelLeft = (s: number) => ((s - 300) / 500) * axisW - AXIS_LABEL_W / 2
  const spreadW     = `${((maxScore - minScore) / 500) * 100}%`

  return (
    <View style={S.divWrap}>
      <View style={S.divHeadRow}>
        <Text style={S.divRef}>3.1.B · Bureau divergence</Text>
        <Text style={S.divPts}>{`${pts} pts`}</Text>
      </View>

      <View style={S.axisWrap}>
        <View style={S.axisTrack} />
        <View style={[S.axisSpread, { left: toPos(minScore), width: spreadW }]} />
        {scored.map((e, i) => (
          <View key={`${i}-${e.name.slice(0, 8)}`} style={[S.axisMarkerLine, { left: toPos(e.reportedScore) }]} />
        ))}
        {scored.map((e, i) => (
          <Text key={`lbl-${i}-${e.name.slice(0, 8)}`} style={[S.axisLabel, { left: toLabelLeft(e.reportedScore) }]}>
            {String(e.reportedScore)}
          </Text>
        ))}
      </View>

      <View style={S.axisScaleRow}>
        {['300', '400', '500', '600', '700', '800'].map(tick => (
          <Text key={`tick-${tick}`} style={S.axisTick}>{tick}</Text>
        ))}
      </View>

      <Text style={S.divNote}>
        <Text style={S.divNoteBold}>{'Divergent bureau profiles observed. '}</Text>
        {sp(
          'Pleks does not interpret this as fraud. Divergence of this magnitude typically resolves ' +
          'once an under-reporting bureau receives a missing trade-line update. ' +
          'Manual confirmation of one trade-line is recommended before drawing conclusions.'
        )}
      </Text>
    </View>
  )
}

interface BureauCoverageMatrixProps {
  data: FitScoreReportData
}

export function BureauCoverageMatrix({ data }: Readonly<BureauCoverageMatrixProps>) {
  const ca = data.creditAnalysis
  const coverageLabel = ca
    ? `${ca.bureausResponding} of ${ca.bureausSolicited} responding`
    : sp(data.dimensions.credit.bureauCoverageDisplay)

  return (
    <View style={S.wrap} wrap={false}>
      <SectionHeader
        badge="3.1"
        title="Bureau coverage and consistency"
        rightLabel={`${coverageLabel} · nightly refresh`}
      />

      <View style={S.block}>
        <BlockHeader
          label="3.1.A"
          title="Coverage matrix · trade-line depth · adverse listings"
          rightTag="refresh · nightly"
        />
        <View style={S.blockBody}>
          {ca === undefined ? (
            <PlaceholderCard
              variant="pending"
              message={
                'Detailed bureau entries pending expanded bureau coverage data. ' +
                'Coverage summary is available on page 1 in the Credit Behaviour dimension card.'
              }
            />
          ) : (
            <>
              <View style={S.tableHead}>
                <Text style={[S.th, S.colBureau]}>Bureau</Text>
                <Text style={[S.th, S.colCov]}>Coverage</Text>
                <Text style={[S.th, S.colTrade]}>Trade-lines</Text>
                <Text style={[S.th, S.colAdverse]}>Adverse listings</Text>
                <Text style={[S.th, S.colScore]}>Score</Text>
              </View>
              {ca.bureauEntries.map((entry, i) => (
                <BureauRow
                  key={`${i}-${entry.name.slice(0, 8)}`}
                  entry={entry}
                  isLast={i === ca.bureauEntries.length - 1}
                />
              ))}

              <View style={S.obsNote}>
                <Text style={S.obsText}>
                  <Text style={S.obsInk}>obs. </Text>
                  {sp(`Bureau coverage at ${ca.bureausResponding} of ${ca.bureausSolicited}. ` +
                    'The FitScore engine de-weighted the credit-behaviour signal proportionally; ' +
                    'this is reflected in the Confidence-in-band signal on page 01.'
                  )}
                </Text>
              </View>

              {ca.bureauEntries.some(e => e.reportedScore !== null) && (
                <DivergenceAxis entries={ca.bureauEntries} />
              )}
            </>
          )}
        </View>
      </View>
    </View>
  )
}
