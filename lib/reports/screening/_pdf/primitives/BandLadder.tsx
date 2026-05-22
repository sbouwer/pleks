/**
 * lib/reports/screening/_pdf/primitives/BandLadder.tsx
 *
 * Two-column profile block: left = 6-rung band ladder, right = three signals
 * (Confidence, Verification Integrity, Material Flags with inline pill badges).
 * F9: Material Flags signal renders inline pill badges (replaces text summary).
 * Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §E.2.
 */

import { View, Text, StyleSheet } from "@react-pdf/renderer"
import { C, FONTS, BAND_LABELS, GRADE_LABELS, sp } from "./theme"
import type { FitScoreReportData, FitScoreBand, ConfidenceGrade, VerificationIntegrityGrade, MaterialFlag } from "./theme"

// ─── Band ladder configuration ────────────────────────────────────────────────

interface Rung {
  key: FitScoreBand
  num: string
  range: string
}

const RUNGS: Rung[] = [
  { key: 'verified_stability',   num: '01', range: '86-100' },
  { key: 'stable_profile',       num: '02', range: '70-85'  },
  { key: 'cautious_review',      num: '03', range: '55-69'  },
  { key: 'limited_confidence',   num: '04', range: '40-54'  },
  { key: 'adverse_signals',      num: '05', range: '0-39'   },
  { key: 'limited_data_profile', num: '06', range: 'n/c'    },
]

// ─── Grade helpers ────────────────────────────────────────────────────────────

const CONFIDENCE_QUALIFIER: Record<ConfidenceGrade, string> = {
  high:         'strong evidence position across all dimensions',
  medium:       'sufficient evidence to position, some gaps remain',
  low:          'limited evidence; result is provisional',
  insufficient: 'insufficient data for confident positioning',
}

const VI_QUALIFIER: Record<VerificationIntegrityGrade, string> = {
  high:    'all primary sources reconciled',
  medium:  'minor gaps in cross-source reconciliation',
  low:     'notable gaps in verification coverage',
  limited: 'verification coverage is limited',
}

const TIER_FILLED: Record<string, number> = {
  high:         4,
  medium:       2,
  low:          1,
  insufficient: 0,
  limited:      0,
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  block: {
    flexDirection: 'row',
    gap:           20,
    marginBottom:  24,
  },

  // Left: band card
  bandCard: {
    flex:            1.35,
    borderWidth:     0.75,
    borderColor:     C.rule.base,
    backgroundColor: C.surface.paperRaised,
    padding:         22,
  },
  cardHead: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'baseline',
    marginBottom:   16,
  },
  cardLabel: {
    fontFamily:    FONTS.mono,
    fontSize:      7.5,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color:         C.ink.mute,
  },
  scoreText: {
    fontFamily:    FONTS.mono,
    fontSize:      8,
    color:         C.ink.mute,
    letterSpacing: 0.5,
  },

  // Rungs
  ladderWrap: {
    borderTopWidth: 0.75,
    borderTopColor: C.rule.base,
    marginBottom:   14,
  },
  rung: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingVertical:   8,
    paddingLeft:       0,
    paddingRight:      4,
    borderBottomWidth: 0.75,
    borderBottomColor: C.rule.base,
    gap:               10,
  },
  rungCurrent: {
    backgroundColor: C.surface.paperSunk,
    borderLeftWidth: 1.5,
    borderLeftColor: C.amber.base,
    paddingLeft:     10,
    marginLeft:      -8,
    paddingRight:    10,
  },
  rungNum: {
    fontFamily:    FONTS.mono,
    fontSize:      7.5,
    color:         C.ink.faint,
    letterSpacing: 0.5,
    width:         18,
  },
  rungNumCurrent: {
    color: C.amber.ink,
  },
  rungName: {
    flex:       1,
    fontFamily: FONTS.sans,
    fontSize:   9.5,
    color:      C.ink.faint,
  },
  rungNameCurrent: {
    color:      C.ink.primary,
    fontWeight: 'bold',
  },
  rungNameOut: {
    color: C.ink.ghost,
  },
  rungRange: {
    fontFamily:    FONTS.mono,
    fontSize:      7.5,
    color:         C.ink.faint,
    letterSpacing: 0.3,
  },
  rungRangeCurrent: {
    color: C.ink.primary,
  },
  cardFoot: {
    fontFamily: FONTS.sans,
    fontSize:   8,
    color:      C.ink.mute,
    lineHeight: 1.55,
  },
  cardFootBold: {
    fontWeight: 'bold',
    color:      C.ink.primary,
  },

  // Right: signals panel
  signalCol: {
    flex: 1,
    gap:  12,
  },
  signal: {
    borderWidth:     0.75,
    borderColor:     C.rule.base,
    backgroundColor: C.surface.paperRaised,
    padding:         16,
  },
  sigLabel: {
    fontFamily:     FONTS.mono,
    fontSize:       7.5,
    letterSpacing:  1,
    textTransform:  'uppercase',
    color:          C.ink.mute,
    flexDirection:  'row',
    justifyContent: 'space-between',
    marginBottom:   10,
  },
  sigRef: {
    color:    C.ink.faint,
    fontSize: 7,
  },
  sigValue: {
    fontFamily:    FONTS.sans,
    fontSize:      13,
    fontWeight:    'bold',
    color:         C.ink.primary,
    letterSpacing: -0.1,
    lineHeight:    1.25,
    marginBottom:  2,
  },
  sigQual: {
    fontFamily:    FONTS.mono,
    fontSize:      7.5,
    color:         C.ink.mute,
    letterSpacing: 0.3,
    marginBottom:  8,
  },
  sigEmpty: {
    fontFamily: FONTS.sans,
    fontSize:   8.5,
    color:      C.ink.faint,
  },
  tierBar: {
    flexDirection: 'row',
    gap:           3,
    marginTop:     4,
  },
  tick: {
    flex:         1,
    height:       4,
    borderRadius: 1,
  },

  // Inline flag pills (F9)
  pillRow: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           4,
    marginTop:     4,
  },
  pill: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               5,
    fontFamily:        FONTS.mono,
    fontSize:          7,
    letterSpacing:     0.3,
    paddingVertical:   3,
    paddingHorizontal: 7,
    borderWidth:       0.75,
    borderRadius:      2,
  },
  pillCritical: { borderColor: C.ink.primary, backgroundColor: C.surface.paper, color: C.ink.primary },
  pillCapping:  { borderColor: C.rule.strong,  backgroundColor: C.surface.paper, color: C.ink.soft   },
  pillTrust:    { borderColor: C.data.base,    backgroundColor: C.data.wash,     color: C.ink.soft   },
  dot: { width: 4, height: 4, borderRadius: 999 },
  dotCritical: { backgroundColor: C.amber.base },
  dotCapping:  { backgroundColor: C.ink.ghost  },
  dotTrust:    { backgroundColor: C.data.soft  },
})

// ─── Sub-components ───────────────────────────────────────────────────────────

function tickColor(i: number, filled: number): string {
  if (i >= filled) return C.ink.ghost
  if (i === filled - 1) return C.amber.base
  return C.ink.primary
}

function TierBar({ grade }: Readonly<{ grade: string }>) {
  const filled = TIER_FILLED[grade] ?? 0
  return (
    <View style={S.tierBar}>
      {[0, 1, 2, 3, 4].map(i => (
        <View key={i} style={[S.tick, { backgroundColor: tickColor(i, filled) }]} />
      ))}
    </View>
  )
}

function BandRung({ rung, currentBand }: Readonly<{ rung: Rung; currentBand: FitScoreBand }>) {
  const isCurrent = rung.key === currentBand
  const LADDER_BANDS: FitScoreBand[] = ['verified_stability','stable_profile','cautious_review','limited_confidence','adverse_signals','limited_data_profile']
  const currentIdx = LADDER_BANDS.indexOf(currentBand)
  const rungIdx    = LADDER_BANDS.indexOf(rung.key)
  const isOut      = currentIdx >= 0 && rungIdx >= 0 && rungIdx !== currentIdx

  return (
    <View style={[S.rung, isCurrent ? S.rungCurrent : {}]}>
      <Text style={[S.rungNum, isCurrent ? S.rungNumCurrent : {}]}>{rung.num}</Text>
      <Text style={[S.rungName, isCurrent ? S.rungNameCurrent : {}, isOut ? S.rungNameOut : {}]}>
        {sp(BAND_LABELS[rung.key])}
      </Text>
      <Text style={[S.rungRange, isCurrent ? S.rungRangeCurrent : {}]}>{rung.range}</Text>
    </View>
  )
}

function Signal({ label, docRef, grade, qualifier }: Readonly<{
  label: string; docRef: string; grade: string; qualifier: string
}>) {
  return (
    <View style={S.signal}>
      <View style={S.sigLabel}>
        <Text>{label}</Text>
        <Text style={S.sigRef}>{docRef}</Text>
      </View>
      <Text style={S.sigValue}>{sp(GRADE_LABELS[grade] ?? grade)}</Text>
      <Text style={S.sigQual}>{sp(qualifier)}</Text>
      <TierBar grade={grade} />
    </View>
  )
}

// ─── Inline flag pill helpers (F9) ───────────────────────────────────────────

function flagPillStyle(cls: MaterialFlag['class']) {
  if (cls === 'critical') return S.pillCritical
  if (cls === 'trust')    return S.pillTrust
  return S.pillCapping
}

function flagDotStyle(cls: MaterialFlag['class']) {
  if (cls === 'critical') return S.dotCritical
  if (cls === 'trust')    return S.dotTrust
  return S.dotCapping
}

function FlagSignal({ data }: Readonly<{ data: FitScoreReportData }>) {
  return (
    <View style={S.signal}>
      <View style={S.sigLabel}>
        <Text>Material flags</Text>
        <Text style={S.sigRef}>1.6</Text>
      </View>
      {data.materialFlags.length === 0
        ? <Text style={S.sigEmpty}>No material flags.</Text>
        : (
          <View style={S.pillRow}>
            {data.materialFlags.map((flag, i) => (
              <View key={`${flag.flag}-${i}`} style={[S.pill, flagPillStyle(flag.class)]}>
                <View style={[S.dot, flagDotStyle(flag.class)]} />
                <Text>{sp(flag.description)}</Text>
              </View>
            ))}
          </View>
        )
      }
    </View>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

interface BandLadderProps {
  data: FitScoreReportData
}

export function BandLadder({ data }: Readonly<BandLadderProps>) {
  const scoreDisplay = data.score === null
    ? 'Score n/c'
    : `Score ${data.score} / 100`

  return (
    <View style={S.block}>
      {/* Left: Band card */}
      <View style={S.bandCard}>
        <View style={S.cardHead}>
          <Text style={S.cardLabel}>Profile band</Text>
          <Text style={S.scoreText}>{scoreDisplay}</Text>
        </View>

        <View style={S.ladderWrap}>
          {RUNGS.map(rung => (
            <BandRung key={rung.key} rung={rung} currentBand={data.band} />
          ))}
        </View>

        <Text style={S.cardFoot}>
          {'The band describes the '}
          <Text style={S.cardFootBold}>observed evidence state</Text>
          {' across affordability, stability, credit behaviour, and verification integrity. The numeric score is metadata for cross-report comparability. It is not a decision.'}
        </Text>
      </View>

      {/* Right: Signals */}
      <View style={S.signalCol}>
        <Signal
          label="Confidence in band"
          docRef="1.5"
          grade={data.confidenceIndex}
          qualifier={sp(CONFIDENCE_QUALIFIER[data.confidenceIndex] ?? '')}
        />
        <Signal
          label="Verification integrity"
          docRef="3.2"
          grade={data.verificationIntegrity}
          qualifier={sp(VI_QUALIFIER[data.verificationIntegrity] ?? '')}
        />
        <FlagSignal data={data} />
      </View>
    </View>
  )
}
