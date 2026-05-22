/**
 * lib/reports/screening/_primitives/DimensionCardGrid.tsx — Nationality-aware dimension card layout for FitScore PDFs
 *
 * Notes: 3-card row for foreign-national-only lease (§6.4); 2×2 grid for SA citizen or mixed lease.
 *        Mixed lease: credit evidence line appended with partial-applicant coverage disclosure.
 *        Credit Behaviour card omitted entirely on foreign-only path — isCreditForeign prop not needed.
 *        Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §6.4.
 */

import { View, StyleSheet } from "@react-pdf/renderer"
import { DimensionCard } from "./DimensionCard"
import { colors } from "./theme"
import type { FitScoreReportData } from "./theme"

const S = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, marginTop: 8 },
})

export const dimensionDivider = StyleSheet.create({
  divider: { borderBottomWidth: 0.75, borderBottomColor: colors.surface.divider, marginVertical: 10 },
}).divider

export function DimensionCardGrid({ data }: Readonly<{ data: FitScoreReportData }>) {
  const { dimensionalScores: ds, narrative: n, isAllForeignNational, verificationIntegrity } = data

  const isMixed = !isAllForeignNational && data.applicants.some(a => a.isForeignNational)
  const saCitizenCount = data.applicants.filter(a => !a.isForeignNational).length
  const totalCount = data.applicants.length

  const creditEvidenceLine = (() => {
    if (isAllForeignNational) return null
    if (isMixed && n.creditEvidenceLine) {
      const suffix = `(Credit Behaviour reflects ${saCitizenCount} of ${totalCount} applicants - see methodology.)`
      return `${n.creditEvidenceLine} ${suffix}`
    }
    return n.creditEvidenceLine
  })()

  if (isAllForeignNational) {
    return (
      <View style={S.row}>
        <DimensionCard name="Affordability" score={ds.affordability} evidenceLine={n.affordabilityEvidenceLine} />
        <DimensionCard name="Stability" score={ds.stability} evidenceLine={n.stabilityEvidenceLine} />
        <DimensionCard
          name="Verification Integrity"
          score={ds.verificationIntegrity}
          grade={verificationIntegrity}
          evidenceLine={n.verificationEvidenceLine}
        />
      </View>
    )
  }

  return (
    <>
      <View style={S.row}>
        <DimensionCard name="Affordability" score={ds.affordability} evidenceLine={n.affordabilityEvidenceLine} />
        <DimensionCard name="Stability" score={ds.stability} evidenceLine={n.stabilityEvidenceLine} />
      </View>
      <View style={[S.row, { marginTop: 6 }]}>
        <DimensionCard
          name="Credit Behaviour"
          score={ds.creditBehaviour}
          evidenceLine={creditEvidenceLine}
        />
        <DimensionCard
          name="Verification Integrity"
          score={ds.verificationIntegrity}
          grade={verificationIntegrity}
          evidenceLine={n.verificationEvidenceLine}
        />
      </View>
    </>
  )
}
