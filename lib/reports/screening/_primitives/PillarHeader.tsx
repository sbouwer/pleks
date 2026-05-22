/**
 * lib/reports/screening/_primitives/PillarHeader.tsx — Four-pillar header band for FitScore Stream 2 PDFs
 *
 * Notes: Four pillars (Band / Confidence / Verification Integrity / Material Flags) with equal visual weight.
 *        Numeric score is supporting metadata only — smaller type below Band pillar, never the headline.
 *        Blocked state: score displayed as dash. Material Flags ordered: Critical → Capping → Trust (§6.5).
 *        Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §6.3, §6.5.
 */

import { View, Text, StyleSheet } from "@react-pdf/renderer"
import { colors, BAND_LABELS, GRADE_LABELS, sp } from "./theme"
import type { FitScoreBand, ConfidenceGrade, VerificationIntegrityGrade, MaterialFlag } from "./theme"

interface Props {
  band: FitScoreBand
  score: number | null
  confidenceIndex: ConfidenceGrade
  verificationIntegrity: VerificationIntegrityGrade
  materialFlags: MaterialFlag[]
}

const FLAG_CLASS_ORDER: Record<string, number> = { critical: 0, capping: 1, trust: 2 }
const CAPPING_SEVERITY: Record<string, number> = { cautious_review: 0, limited_confidence: 1, stable_profile: 2 }

function cappingSeverity(capCeiling: string | null): number {
  return capCeiling === null ? 3 : (CAPPING_SEVERITY[capCeiling] ?? 2)
}

function sortFlags(flags: MaterialFlag[]): MaterialFlag[] {
  return [...flags].sort((a, b) => {
    const classOrd = (FLAG_CLASS_ORDER[a.class] ?? 1) - (FLAG_CLASS_ORDER[b.class] ?? 1)
    if (classOrd !== 0) return classOrd
    if (a.class === 'capping' && b.class === 'capping') {
      return cappingSeverity(a.capCeiling) - cappingSeverity(b.capCeiling)
    }
    return 0
  })
}

const S = StyleSheet.create({
  container:    { flexDirection: 'row', gap: 8, marginBottom: 10 },
  pillar:       { flex: 1, flexDirection: 'column' },
  pillarWide:   { flex: 2, flexDirection: 'column' },
  pillarLabel:  { fontSize: 6.5, fontFamily: 'Helvetica-Bold', color: colors.text.faint, textTransform: 'uppercase', marginBottom: 4 },
  bandBadge:    { borderRadius: 3, paddingHorizontal: 6, paddingVertical: 3, alignSelf: 'flex-start' },
  bandText:     { fontSize: 10, fontFamily: 'Helvetica-Bold' },
  scoreCaption: { fontSize: 7.5, fontFamily: 'Helvetica', color: colors.text.soft, marginTop: 3 },
  gradeText:    { fontSize: 10, fontFamily: 'Helvetica-Bold', color: colors.text.primary },
  flagRow:      { paddingLeft: 5, paddingVertical: 2, paddingRight: 4, marginBottom: 2 },
  flagText:     { fontSize: 8, fontFamily: 'Helvetica', color: colors.text.primary },
  noFlags:      { fontSize: 8, fontFamily: 'Helvetica', color: colors.text.faint, fontStyle: 'italic' },
})

function PillarLabel({ text }: Readonly<{ text: string }>) {
  return <Text style={S.pillarLabel}>{text}</Text>
}

function FlagRow({ flag }: Readonly<{ flag: MaterialFlag }>) {
  const fc = colors.flag[flag.class] ?? colors.flag.capping
  const label = flag.applicantLabel
    ? `${sp(flag.description)} — ${flag.applicantLabel}`
    : sp(flag.description)
  return (
    <View style={[S.flagRow, {
      borderLeftWidth: 2,
      borderLeftColor: fc.border,
      borderStyle: flag.class === 'trust' ? 'dashed' : 'solid',
      backgroundColor: fc.bg,
    }]}>
      <Text style={S.flagText}>{label}</Text>
    </View>
  )
}

export function PillarHeader({ band, score, confidenceIndex, verificationIntegrity, materialFlags }: Readonly<Props>) {
  const bc = colors.band[band]
  const isBlocked = band === 'blocked'
  let scoreDisplay: string | null = null
  if (isBlocked) scoreDisplay = '— (Blocked)'
  else if (score !== null) scoreDisplay = `Score: ${score}`
  const sorted = sortFlags(materialFlags)

  return (
    <View style={S.container}>
      {/* Pillar 1 — Band */}
      <View style={S.pillar}>
        <PillarLabel text="Band" />
        <View style={[S.bandBadge, { backgroundColor: bc.bg }]}>
          <Text style={[S.bandText, { color: bc.text }]}>{BAND_LABELS[band]}</Text>
        </View>
        {scoreDisplay !== null && (
          <Text style={S.scoreCaption}>{scoreDisplay}</Text>
        )}
      </View>

      {/* Pillar 2 — Confidence */}
      <View style={S.pillar}>
        <PillarLabel text="Confidence" />
        <Text style={S.gradeText}>{GRADE_LABELS[confidenceIndex] ?? sp(confidenceIndex)}</Text>
      </View>

      {/* Pillar 3 — Verification Integrity */}
      <View style={S.pillar}>
        <PillarLabel text="Verification Integrity" />
        <Text style={S.gradeText}>{GRADE_LABELS[verificationIntegrity] ?? sp(verificationIntegrity)}</Text>
      </View>

      {/* Pillar 4 — Material Flags (wider) */}
      <View style={S.pillarWide}>
        <PillarLabel text="Material Flags" />
        {sorted.length === 0 ? (
          <Text style={S.noFlags}>No material flags.</Text>
        ) : (
          sorted.map((f, i) => <FlagRow key={`${f.flag}-${i}`} flag={f} />)
        )}
      </View>
    </View>
  )
}
