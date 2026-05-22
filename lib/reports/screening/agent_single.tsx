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
import { DimensionCardGrid, dimensionDivider } from "./_primitives/DimensionCardGrid"
import { NarrativeColumns } from "./_primitives/NarrativeColumns"
import { TitleBlock, ReportPage } from "./_primitives/DocumentChrome"
import type { FitScoreReportData } from "./_primitives/theme"

const GS = StyleSheet.create({
  divider: dimensionDivider,
})

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
