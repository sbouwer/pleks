/**
 * lib/reports/screening/_pdf/primitives/DimensionCardEditorial.tsx
 *
 * 2x2 grid of dimensional score cards: Affordability, Stability, Credit Behaviour,
 * Verification Integrity. Each card: header, qualitative headline, score evidence bar,
 * key stats, and the dimension-specific evidence line from narrative.
 * For foreign-national-only leases, credit behaviour card shows "Not Applicable."
 * Maps to .dims / .dim in HTML reference.
 * Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §E.2.
 */

import { View, Text, StyleSheet } from "@react-pdf/renderer"
import { C, sp } from "./theme"
import type { FitScoreReportData } from "./theme"

// ─── Styles ───────────────────────────────────────────────────────────────────

const S = StyleSheet.create({
  grid: {
    flexDirection:   'row',
    flexWrap:        'wrap',
    borderWidth:     0.75,
    borderColor:     C.rule.base,
    backgroundColor: C.surface.paperRaised,
    marginBottom:    16,
  },
  card: {
    width:             '50%',
    padding:           24,
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
    marginBottom:   12,
  },
  headLabel: {
    fontFamily:    'JetBrains Mono',
    fontSize:      7.5,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color:         C.ink.mute,
  },
  headRef: {
    fontFamily:    'JetBrains Mono',
    fontSize:      7,
    color:         C.ink.faint,
    letterSpacing: 0.3,
  },

  qual: {
    fontFamily:    'Inter Tight',
    fontSize:      11,
    fontWeight:    'bold',
    color:         C.ink.primary,
    letterSpacing: -0.1,
    lineHeight:    1.3,
    marginBottom:  12,
  },

  stats: {
    borderTopWidth:    0.75,
    borderTopColor:    C.rule.base,
    borderBottomWidth: 0.75,
    borderBottomColor: C.rule.base,
    paddingVertical:   10,
    marginBottom:      12,
  },
  statRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'baseline',
    marginBottom:   5,
  },
  statRowLast: { marginBottom: 0 },
  statLabel: {
    fontFamily:    'JetBrains Mono',
    fontSize:      7.5,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color:         C.ink.mute,
    flex:          1,
  },
  statValue:      { fontFamily: 'JetBrains Mono', fontSize: 9.5, color: C.ink.primary, letterSpacing: 0.3 },
  statValueMuted: { color: C.ink.soft },

  ebarWrap: { marginBottom: 12 },
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
    backgroundColor: C.data.base,
    borderRadius:    1,
  },
  ebarPin: {
    position:        'absolute',
    top:             -3,
    bottom:          -3,
    width:           2,
    backgroundColor: C.amber.base,
  },

  obs: { fontFamily: 'Inter Tight', fontSize: 8.5, color: C.ink.soft, lineHeight: 1.55 },

  naText: { fontFamily: 'Inter Tight', fontSize: 9.5, color: C.ink.mute },
  naSub:  { fontFamily: 'Inter Tight', fontSize: 8.5, color: C.ink.faint, lineHeight: 1.55, marginTop: 8 },
})

// ─── Evidence bar ─────────────────────────────────────────────────────────────

function EvidenceBar({ score }: Readonly<{ score: number }>) {
  const pct = Math.max(0, Math.min(100, score))
  return (
    <View style={S.ebarWrap}>
      <View style={S.ebarTrack}>
        <View style={[S.ebarFill, { width: `${pct}%` }]} />
        <View style={[S.ebarPin, { left: `${pct}%` }]} />
      </View>
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

// ─── Card bodies ──────────────────────────────────────────────────────────────

function AffordabilityCard({ data }: Readonly<{ data: FitScoreReportData }>) {
  const score = data.dimensionalScores.affordability
  return (
    <View>
      <Text style={S.qual}>{sp(data.narrative.affordabilityEvidenceLine)}</Text>
      <View style={S.stats}>
        <StatRow label="Score" value={String(score)} />
        <StatRow label="Income share" value={`${data.applicants[0]?.incomeSharePct ?? 0}% primary`} muted />
        <StatRow label="Applicants" value={String(data.applicants.length)} muted isLast />
      </View>
      <EvidenceBar score={score} />
      <Text style={S.obs}>{sp(data.narrative.affordabilityEvidenceLine)}</Text>
    </View>
  )
}

function StabilityCard({ data }: Readonly<{ data: FitScoreReportData }>) {
  const score   = data.dimensionalScores.stability
  const bureaus = data.applicants[0]?.respondingBureaus.length ?? 0
  return (
    <View>
      <Text style={S.qual}>{sp(data.narrative.stabilityEvidenceLine)}</Text>
      <View style={S.stats}>
        <StatRow label="Score" value={String(score)} />
        <StatRow label="Bureaus" value={`${bureaus} responding`} muted />
        <StatRow label="Applicants" value={String(data.applicants.length)} muted isLast />
      </View>
      <EvidenceBar score={score} />
      <Text style={S.obs}>{sp(data.narrative.stabilityEvidenceLine)}</Text>
    </View>
  )
}

function CreditCard({ data }: Readonly<{ data: FitScoreReportData }>) {
  if (data.isAllForeignNational || data.dimensionalScores.creditBehaviour === null) {
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
  const score   = data.dimensionalScores.creditBehaviour
  const bureaus = data.applicants.reduce((m, a) => Math.max(m, a.respondingBureaus.length), 0)
  const critical = data.materialFlags.filter(f => f.class === 'critical').length
  return (
    <View>
      <Text style={S.qual}>{sp(data.narrative.creditEvidenceLine)}</Text>
      <View style={S.stats}>
        <StatRow label="Score" value={String(score)} />
        <StatRow label="Bureau coverage" value={`${bureaus} responding`} muted />
        <StatRow label="Critical flags" value={String(critical)} muted isLast />
      </View>
      <EvidenceBar score={score} />
      <Text style={S.obs}>{sp(data.narrative.creditEvidenceLine)}</Text>
    </View>
  )
}

function VerificationCard({ data }: Readonly<{ data: FitScoreReportData }>) {
  const score      = data.dimensionalScores.verificationIntegrity
  const passTotal  = data.applicants.reduce((s, a) => s + a.verificationPassCount, 0)
  const checkTotal = data.applicants.reduce((s, a) => s + a.verificationTotal, 0)
  return (
    <View>
      <Text style={S.qual}>{sp(data.narrative.verificationEvidenceLine)}</Text>
      <View style={S.stats}>
        <StatRow label="Score" value={String(score)} />
        <StatRow label="Checks passed" value={`${passTotal} / ${checkTotal}`} />
        <StatRow label="Applicants" value={String(data.applicants.length)} muted isLast />
      </View>
      <EvidenceBar score={score} />
      <Text style={S.obs}>{sp(data.narrative.verificationEvidenceLine)}</Text>
    </View>
  )
}

// ─── Dimension card wrapper ───────────────────────────────────────────────────

function DimCard({ label, docRef, children, noRight = false, noBottom = false }: Readonly<{
  label: string; docRef: string; children: React.ReactNode; noRight?: boolean; noBottom?: boolean
}>) {
  return (
    <View style={[S.card, noRight ? S.cardNoRight : {}, noBottom ? S.cardNoBottom : {}]}>
      <View style={S.cardHead}>
        <Text style={S.headLabel}>{label}</Text>
        <Text style={S.headRef}>{docRef}</Text>
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
  return (
    <View style={S.grid}>
      <DimCard label="01 Affordability" docRef="2">
        <AffordabilityCard data={data} />
      </DimCard>
      <DimCard label="02 Stability" docRef="3.1" noRight>
        <StabilityCard data={data} />
      </DimCard>
      <DimCard label="03 Credit behaviour" docRef="3.1" noBottom>
        <CreditCard data={data} />
      </DimCard>
      <DimCard label="04 Verification integrity" docRef="3.2" noRight noBottom>
        <VerificationCard data={data} />
      </DimCard>
    </View>
  )
}
