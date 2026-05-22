/**
 * lib/reports/screening/_primitives/DimensionCard.tsx — Per-dimension score card for FitScore Stream 2 PDFs
 *
 * Notes: Affordability / Stability / Credit Behaviour show numeric score as primary.
 *        Verification Integrity shows qualitative grade as primary, numeric score secondary.
 *        Foreign-national-only Credit Behaviour: renders methodology note instead of evidence line.
 *        Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §6.4.
 */

import { View, Text, StyleSheet } from "@react-pdf/renderer"
import { colors, GRADE_LABELS, sp } from "./theme"

interface Props {
  name: string
  score: number | null              // null for Credit Behaviour on foreign-only lease
  grade?: string                    // primary display for Verification Integrity
  evidenceLine: string | null
}

const S = StyleSheet.create({
  card: {
    flex: 1,
    borderWidth: 0.75,
    borderColor: colors.surface.divider,
    borderRadius: 3,
    padding: 8,
    backgroundColor: colors.surface.paper,
  },
  name: {
    fontSize: 6.5,
    fontFamily: 'Helvetica-Bold',
    color: colors.text.faint,
    textTransform: 'uppercase',
    marginBottom: 5,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 3,
    marginBottom: 5,
  },
  score:    { fontSize: 14, fontFamily: 'Helvetica-Bold', color: colors.text.primary },
  scoreMax: { fontSize: 8,  fontFamily: 'Helvetica',      color: colors.text.soft },
  grade:    { fontSize: 11, fontFamily: 'Helvetica-Bold', color: colors.text.primary },
  gradeSecondary: { fontSize: 8, fontFamily: 'Helvetica', color: colors.text.soft, marginLeft: 4 },
  divider:  { borderBottomWidth: 0.5, borderBottomColor: colors.surface.divider, marginBottom: 5 },
  evidence: { fontSize: 8, fontFamily: 'Helvetica', color: colors.text.soft, lineHeight: 1.4 },
})

export function DimensionCard({ name, score, grade, evidenceLine }: Readonly<Props>) {
  return (
    <View style={S.card}>
      <Text style={S.name}>{name}</Text>

      <View style={S.scoreRow}>
        {grade ? (
          <>
            <Text style={S.grade}>{GRADE_LABELS[grade] ?? sp(grade)}</Text>
            {score !== null && (
              <Text style={S.gradeSecondary}>{score}/100</Text>
            )}
          </>
        ) : (
          <>
            <Text style={S.score}>{score ?? '—'}</Text>
            {score !== null && <Text style={S.scoreMax}>/100</Text>}
          </>
        )}
      </View>

      <View style={S.divider} />

      <Text style={S.evidence}>{sp(evidenceLine ?? '')}</Text>
    </View>
  )
}
