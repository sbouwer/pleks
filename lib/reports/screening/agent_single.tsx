/**
 * lib/reports/screening/agent_single.tsx — FitScore Stream 2 PDF for single-applicant leases
 *
 * Auth:   internal — rendered by the PDF generation route (Phase F)
 * Data:   FitScoreReportData assembled by the orchestrator and stored in applications.fitscore_*
 * Notes:  Used when co_applicants.count == 0 (no applicant roster per §6.7).
 *         Nationality-aware dimension card layout: 2×2 for SA, 3-card row for foreign-only (§6.4).
 *         Mixed leases: 2×2 with Credit Behaviour footnote disclosing partial applicant coverage.
 *         Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §6.9, §10.6.
 */

import { Document, View, StyleSheet } from "@react-pdf/renderer"
import { PillarHeader } from "./_primitives/PillarHeader"
import { DimensionCard } from "./_primitives/DimensionCard"
import { NarrativeColumns } from "./_primitives/NarrativeColumns"
import { TitleBlock, ReportPage } from "./_primitives/DocumentChrome"
import { colors } from "./_primitives/theme"
import type { FitScoreReportData } from "./_primitives/theme"

// ─── Dimension card grid (shared logic with agent_multi) ──────────────────────

const GS = StyleSheet.create({
  row:     { flexDirection: 'row', gap: 8, marginTop: 8 },
  divider: { borderBottomWidth: 0.75, borderBottomColor: colors.surface.divider, marginVertical: 10 },
})

function DimensionCardGrid({ data }: Readonly<{ data: FitScoreReportData }>) {
  const { dimensionalScores: ds, narrative: n, isAllForeignNational, verificationIntegrity } = data

  const isMixed = !isAllForeignNational && data.applicants.some(a => a.isForeignNational)
  const saCitizenCount = data.applicants.filter(a => !a.isForeignNational).length
  const totalCount = data.applicants.length

  const creditEvidenceLine = (() => {
    if (isAllForeignNational) return null
    if (isMixed && n.creditEvidenceLine) {
      return `${n.creditEvidenceLine} (Credit Behaviour reflects ${saCitizenCount} of ${totalCount} applicants — see methodology.)`
    }
    return n.creditEvidenceLine
  })()

  if (isAllForeignNational) {
    // 3-card row for foreign-national-only lease
    return (
      <View style={GS.row}>
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

  // 2×2 grid for SA citizen or mixed lease
  return (
    <>
      <View style={GS.row}>
        <DimensionCard name="Affordability" score={ds.affordability} evidenceLine={n.affordabilityEvidenceLine} />
        <DimensionCard name="Stability" score={ds.stability} evidenceLine={n.stabilityEvidenceLine} />
      </View>
      <View style={[GS.row, { marginTop: 6 }]}>
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

// ─── Template ─────────────────────────────────────────────────────────────────

export function AgentSingleReport({ data }: Readonly<{ data: FitScoreReportData }>) {
  return (
    <Document
      title={`Pleks FitScore Report - Application ${data.applicationRef}`}
      author="Pleks"
      subject="Rental screening evidence"
      creator={`Pleks Stream 2 generator ${data.engineVersion}`}
    >
      <ReportPage data={data}>
        <TitleBlock data={data} />

        <PillarHeader
          band={data.band}
          score={data.score}
          confidenceIndex={data.confidenceIndex}
          verificationIntegrity={data.verificationIntegrity}
          materialFlags={data.materialFlags}
        />

        <View style={GS.divider} />

        <DimensionCardGrid data={data} />

        <View style={GS.divider} />

        <NarrativeColumns narrative={data.narrative} />
      </ReportPage>
    </Document>
  )
}
