/**
 * lib/reports/screening/_pdf/primitives/DimensionCardEditorial.tsx
 *
 * 2x2 grid of dimensional score cards: Affordability, Stability, Credit Behaviour,
 * Verification Integrity.
 * F10/F11: Observation bullets from narrative replace duplicated evidence line text.
 * F12: EvidenceBar renders a preferred-threshold marker from engine-emitted field.
 * F13: Stats use orchestrator-computed data.dimensions.* values.
 * Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §E.2.
 */

import { View, Text, StyleSheet } from "@react-pdf/renderer"
import { C, D, FONTS, sp } from "./theme"
import type { FitScoreReportData } from "./theme"
import { PlaceholderCard } from "./PlaceholderCard"

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  grid: {
    flexDirection:   'row',
    flexWrap:        'wrap',
    borderWidth:     0.75,
    borderColor:     C.rule.base,
    backgroundColor: C.surface.paperRaised,
    marginBottom:    D.primitiveGap,
  },
  card: {
    width:             '50%',
    paddingVertical:   D.cardPaddingY,
    paddingHorizontal: D.cardPaddingX,
    borderRightWidth:  0.75,
    borderRightColor:  C.rule.base,
    borderBottomWidth: 0.75,
    borderBottomColor: C.rule.base,
  },
  cardNoRight:  { borderRightWidth:  0 },
  cardNoBottom: { borderBottomWidth: 0 },

  cardHead: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'baseline',
    marginBottom:   8,
  },
  headLabel: {
    fontFamily:    FONTS.mono,
    fontSize:      7.5,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color:         C.ink.mute,
  },
  headRef: {
    fontFamily:    FONTS.mono,
    fontSize:      7,
    color:         C.ink.faint,
    letterSpacing: 0.3,
  },

  qual: {
    fontFamily:    FONTS.sans,
    fontSize:      11,
    fontWeight:    'bold',
    color:         C.ink.primary,
    letterSpacing: -0.1,
    lineHeight:    1.3,
    marginBottom:  8,
  },

  stats: {
    borderTopWidth:    0.75,
    borderTopColor:    C.rule.base,
    borderBottomWidth: 0.75,
    borderBottomColor: C.rule.base,
    paddingVertical:   D.cardPaddingY,
    marginBottom:      8,
  },
  statRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'baseline',
    marginBottom:   4,
  },
  statRowLast: { marginBottom: 0 },
  statLabel: {
    fontFamily:    FONTS.mono,
    fontSize:      7.5,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color:         C.ink.mute,
    flex:          1,
  },
  statValue:      { fontFamily: FONTS.mono, fontSize: 9.5, color: C.ink.primary,  letterSpacing: 0.3 },
  statValueMuted: { color: C.ink.soft },

  ebarWrap: { marginBottom: 8 },
  ebarTrack: {
    height:          5,
    backgroundColor: C.surface.paperDeeper,
    borderWidth:     0.5,
    borderColor:     C.rule.base,
    borderRadius:    1,
    position:        'relative',
  },
  ebarFill: {
    position:        'absolute',
    left:            0,
    top:             0,
    bottom:          0,
    backgroundColor: C.data.soft,    // light baseline — contrasts clearly with surplus
    borderRadius:    1,
  },
  ebarSurplus: {
    position:        'absolute',
    top:             0,
    bottom:          0,
    backgroundColor: C.data.base,    // full dark blue — clearly darker than soft baseline
    borderRadius:    1,
  },
  ebarDeficit: {
    position:        'absolute',
    top:             0,
    bottom:          0,
    backgroundColor: C.amber.deficit, // ~45% amber over track bg; clearly visible
    borderRadius:    1,
  },
  ebarPref: {
    position:        'absolute',
    top:             -2,
    bottom:          -2,
    width:           1.5,
    backgroundColor: C.amber.ink,
  },
  ebarPin: {
    position:        'absolute',
    top:             -3,
    bottom:          -3,
    width:           2,
    backgroundColor: C.amber.base,
  },
  ebarLabelRow: { marginTop: 3, alignItems: 'flex-end' },
  ebarLabel: {
    fontFamily:    FONTS.mono,
    fontSize:      6,
    color:         C.amber.ink,
    letterSpacing: 0.3,
  },

  // Observation bullets (F10/F11)
  obsList:  { gap: 4 },
  obsRow:   { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
  obsDot:   { fontFamily: FONTS.mono, fontSize: 8, color: C.ink.ghost, marginTop: 1 },
  obsText:  { fontFamily: FONTS.sans, fontSize: 8.5, color: C.ink.soft, lineHeight: D.bodyLineHeight, flex: 1 },

  naText: { fontFamily: FONTS.sans, fontSize: 9.5, color: C.ink.mute },
  naSub:  { fontFamily: FONTS.sans, fontSize: 8.5, color: C.ink.faint, lineHeight: D.bodyLineHeight, marginTop: 6 },
})

// ─── Evidence bar (F12) ───────────────────────────────────────────────────────

function EvidenceBar({ score, preferred }: Readonly<{ score: number; preferred: number }>) {
  const pct     = Math.max(0, Math.min(100, score))
  const prefPct = Math.max(0, Math.min(100, preferred))
  const isSurplus  = pct > prefPct
  const isDeficit  = pct < prefPct
  const showLabel  = pct >= prefPct       // State A (surplus) and State C (edge); not deficit
  const baseWidth  = `${Math.min(pct, prefPct)}%`
  return (
    <View style={S.ebarWrap}>
      <View style={S.ebarTrack}>
        {/* Baseline fill: 0 → min(score, threshold) */}
        <View style={[S.ebarFill, { width: baseWidth }]} />
        {/* Surplus segment (score > threshold): darker blue from threshold to score */}
        {isSurplus && (
          <View style={[S.ebarSurplus, { left: `${prefPct}%`, width: `${pct - prefPct}%` }]} />
        )}
        {/* Deficit segment (score < threshold): amber wash from score to threshold */}
        {isDeficit && (
          <View style={[S.ebarDeficit, { left: `${pct}%`, width: `${prefPct - pct}%` }]} />
        )}
        {/* Threshold tick — always visible */}
        <View style={[S.ebarPref, { left: `${prefPct}%` }]} />
        {/* Score pin — always visible */}
        <View style={[S.ebarPin, { left: `${pct}%` }]} />
      </View>
      {/* min. preferred label: State A (surplus) and State C (edge) only */}
      {showLabel && (
        <View style={[S.ebarLabelRow, { width: `${prefPct}%` }]}>
          <Text style={S.ebarLabel}>min. preferred</Text>
        </View>
      )}
    </View>
  )
}

// ─── Stat row ─────────────────────────────────────────────────────────────────

function StatRow({ label, value, muted = false, isLast = false }: Readonly<{
  label: string; value: string; muted?: boolean; isLast?: boolean
}>) {
  return (
    <View style={[S.statRow, isLast ? S.statRowLast : {}]}>
      <Text style={S.statLabel}>{label}</Text>
      <Text style={[S.statValue, muted ? S.statValueMuted : {}]}>{value}</Text>
    </View>
  )
}

// ─── Observation bullets (F10/F11) ────────────────────────────────────────────

function ObsBullets({ bullets }: Readonly<{ bullets: string[] }>) {
  return (
    <View style={S.obsList}>
      {bullets.map((bullet, i) => (
        <View key={`${i}-${bullet.slice(0, 16)}`} style={S.obsRow}>
          <Text style={S.obsDot}>·</Text>
          <Text style={S.obsText}>{sp(bullet)}</Text>
        </View>
      ))}
    </View>
  )
}

// ─── Card bodies ──────────────────────────────────────────────────────────────

const NOT_ASSESSED_MSG = 'Insufficient verified evidence available for this dimension.'

function AffordabilityCard({ data, score }: Readonly<{ data: FitScoreReportData; score: number }>) {
  const dim = data.dimensions.affordability
  return (
    <View>
      <Text style={S.qual}>{sp(data.narrative.affordabilityEvidenceLine)}</Text>
      <View style={S.stats}>
        <StatRow label="Score"  value={String(score)} />
        <StatRow label="Rent"   value={`${dim.rentToIncomePct}% of income`} muted />
        <StatRow label="Window" value={`${dim.windowMonths} months`}        muted isLast />
      </View>
      <EvidenceBar score={score} preferred={data.dimensionalScores.affordability_preferred_threshold} />
      <ObsBullets bullets={data.narrative.affordabilityObservations} />
    </View>
  )
}

function StabilityCard({ data, score }: Readonly<{ data: FitScoreReportData; score: number }>) {
  const dim = data.dimensions.stability
  return (
    <View>
      <Text style={S.qual}>{sp(data.narrative.stabilityEvidenceLine)}</Text>
      <View style={S.stats}>
        <StatRow label="Score"          value={String(score)} />
        <StatRow label="Current tenure" value={sp(dim.currentTenureDisplay)}  muted />
        <StatRow label="Employers (7y)" value={String(dim.employersIn7Years)} muted isLast />
      </View>
      <EvidenceBar score={score} preferred={data.dimensionalScores.stability_preferred_threshold} />
      <ObsBullets bullets={data.narrative.stabilityObservations} />
    </View>
  )
}

function CreditCard({ data }: Readonly<{ data: FitScoreReportData }>) {
  if (data.isAllForeignNational) {
    return (
      <View>
        <Text style={S.naText}>Not applicable for all-foreign-national leases.</Text>
        <Text style={S.naSub}>
          Credit bureau data is not available for foreign national applicants.
          Affordability and verification dimensions carry additional weight in the composite score.
        </Text>
      </View>
    )
  }
  const score = data.dimensionalScores.creditBehaviour
  if (score === null) {
    return <PlaceholderCard variant="notAssessed" message={NOT_ASSESSED_MSG} />
  }
  const dim        = data.dimensions.credit
  const divDisplay = dim.divergencePoints === null ? 'None' : String(dim.divergencePoints)
  return (
    <View>
      <Text style={S.qual}>{sp(data.narrative.creditEvidenceLine)}</Text>
      <View style={S.stats}>
        <StatRow label="Score"           value={String(score)} />
        <StatRow label="Bureau coverage" value={sp(dim.bureauCoverageDisplay)} muted />
        <StatRow label="Divergence"      value={divDisplay}                    muted isLast />
      </View>
      <EvidenceBar score={score} preferred={data.dimensionalScores.creditBehaviour_preferred_threshold ?? 65} />
      <ObsBullets bullets={data.narrative.creditObservations ?? []} />
    </View>
  )
}

function VerificationCard({ data, score }: Readonly<{ data: FitScoreReportData; score: number }>) {
  const dim = data.dimensions.verification
  return (
    <View>
      <Text style={S.qual}>{sp(data.narrative.verificationEvidenceLine)}</Text>
      <View style={S.stats}>
        <StatRow label="Score"             value={String(score)} />
        <StatRow label="Checks"            value={sp(dim.checksPassedDisplay)}          />
        <StatRow label="Overrides pending" value={String(dim.manualOverridesPending)} muted isLast />
      </View>
      <EvidenceBar score={score} preferred={data.dimensionalScores.verificationIntegrity_preferred_threshold} />
      <ObsBullets bullets={data.narrative.verificationObservations} />
    </View>
  )
}

// ─── Dimension card wrapper ───────────────────────────────────────────────────

function DimCard({ label, docRef, children, noRight = false, noBottom = false }: Readonly<{
  label: string; docRef?: string; children: React.ReactNode; noRight?: boolean; noBottom?: boolean
}>) {
  return (
    <View style={[S.card, noRight ? S.cardNoRight : {}, noBottom ? S.cardNoBottom : {}]} wrap={false}>
      <View style={S.cardHead}>
        <Text style={S.headLabel}>{label}</Text>
        {docRef !== undefined && <Text style={S.headRef}>{docRef}</Text>}
      </View>
      {children}
    </View>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────

interface DimensionCardEditorialProps {
  data: FitScoreReportData
}

export function DimensionCardEditorial({ data }: Readonly<DimensionCardEditorialProps>) {
  const affScore = data.dimensionalScores.affordability
  const stabScore = data.dimensionalScores.stability
  const viScore   = data.dimensionalScores.verificationIntegrity

  return (
    <View style={S.grid} wrap={false}>
      <DimCard label="01 Affordability" docRef="2">
        {affScore === null
          ? <PlaceholderCard variant="notAssessed" message={NOT_ASSESSED_MSG} />
          : <AffordabilityCard data={data} score={affScore} />
        }
      </DimCard>
      <DimCard label="02 Stability" noRight>
        {stabScore === null
          ? <PlaceholderCard variant="notAssessed" message={NOT_ASSESSED_MSG} />
          : <StabilityCard data={data} score={stabScore} />
        }
      </DimCard>
      <DimCard label="03 Credit behaviour" docRef="3.1" noBottom>
        <CreditCard data={data} />
      </DimCard>
      <DimCard label="04 Verification integrity" docRef="3.2" noRight noBottom>
        {viScore === null
          ? <PlaceholderCard variant="notAssessed" message={NOT_ASSESSED_MSG} />
          : <VerificationCard data={data} score={viScore} />
        }
      </DimCard>
    </View>
  )
}
