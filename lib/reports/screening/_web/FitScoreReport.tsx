/**
 * lib/reports/screening/_web/FitScoreReport.tsx — FitScore dashboard compose layer
 *
 * Auth:   agent workspace (server component — data assembled by parent page)
 * Data:   FitScoreReportData from assembleReportData.ts
 * Notes:  Tribunal-match invariant: same evidentiary content as the archived PDF, primitive-for-primitive.
 *         All five sections render for both scored and LDP layouts (LDP null dims → PlaceholderCard notAssessed).
 *         Replaces FitScoreSection.tsx. See ADDENDUM_14H_FITSCORE_DELIVERY.md §10.7.
 */
import type { JSX } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { FitScoreReportData } from "@/lib/reports/screening/_primitives/theme"
import { toDocAnchorId } from "@/lib/reports/screening/_primitives/anchors"
import { SectionNav } from "@/lib/reports/screening/_web/SectionNav"
import { PopiaResponseAction } from "@/app/(dashboard)/applications/[id]/_components/PopiaResponseAction"

import { EditorialHeadline }       from "./primitives/EditorialHeadline"
import { MetaStrip }               from "./primitives/MetaStrip"
import { IdentityRow }             from "./primitives/IdentityRow"
import { BandLadder }              from "./primitives/BandLadder"
import { ApplicantDetail }         from "./primitives/ApplicantDetail"
import { DimensionCardEditorial }  from "./primitives/DimensionCardEditorial"
import { DimensionReadingGuide }   from "./primitives/DimensionReadingGuide"
import { IncomeReconciliationTable } from "./primitives/IncomeReconciliationTable"
import { ExpenditureTable }        from "./primitives/ExpenditureTable"
import { RiskUncertaintySplit }    from "./primitives/RiskUncertaintySplit"
import { BureauCoverageMatrix }    from "./primitives/BureauCoverageMatrix"
import { VerificationCheckTable }  from "./primitives/VerificationCheckTable"
import { ObservedStrengths }       from "./primitives/ObservedStrengths"
import { AssessmentSynthesis }     from "./primitives/AssessmentSynthesis"
import { DocumentReadingGuide }    from "./primitives/DocumentReadingGuide"
import { AttestationCard }         from "./primitives/AttestationCard"

const SECTIONS = [
  { id: toDocAnchorId("1"), label: "Profile" },
  { id: toDocAnchorId("2"), label: "Financial Analysis" },
  { id: toDocAnchorId("3"), label: "Evidence & Credit" },
  { id: toDocAnchorId("4"), label: "Narrative" },
  { id: toDocAnchorId("5"), label: "Attestation" },
]

interface FitScoreReportProps {
  data:           FitScoreReportData
  applicationId:  string
  canGenerateS23: boolean
}

export function FitScoreReport({
  data, applicationId, canGenerateS23,
}: Readonly<FitScoreReportProps>): JSX.Element {
  return (
    <Card className="mt-6 overflow-hidden">
      <CardHeader className="pb-0">
        <CardTitle className="text-lg">FitScore Report (Stage 2)</CardTitle>
      </CardHeader>

      <div className="px-6">
        <SectionNav sections={SECTIONS} />
      </div>

      <CardContent className="space-y-0 pt-5">

        {/* §1 — Profile */}
        <section id={toDocAnchorId("1")}>
          <EditorialHeadline data={data} />
          <MetaStrip         data={data} />
          <IdentityRow       data={data} />
          <BandLadder        data={data} />
          {data.applicants.length > 1 && <ApplicantDetail applicants={data.applicants} />}
          <DimensionCardEditorial data={data} />
          <DimensionReadingGuide />
        </section>

        <div className="border-t border-border my-6" />

        {/* §2 — Financial Analysis */}
        <section id={toDocAnchorId("2")}>
          <IncomeReconciliationTable data={data} />
          <ExpenditureTable          data={data} />
          <RiskUncertaintySplit      data={data} />
        </section>

        <div className="border-t border-border my-6" />

        {/* §3 — Evidence and Credit */}
        <section id={toDocAnchorId("3")}>
          <BureauCoverageMatrix    data={data} />
          <VerificationCheckTable  data={data} />
        </section>

        <div className="border-t border-border my-6" />

        {/* §4 — Assessment Narrative */}
        <section id={toDocAnchorId("4")}>
          <ObservedStrengths   data={data} />
          <AssessmentSynthesis data={data} />
        </section>

        <div className="border-t border-border my-6" />

        {/* §5 — Document Attestation */}
        <section id={toDocAnchorId("5")}>
          <DocumentReadingGuide />
          <AttestationCard data={data} />
        </section>

        {/* POPIA s23 action */}
        <div className="border-t border-border pt-4 mt-5 flex items-center justify-end">
          <PopiaResponseAction applicationId={applicationId} hasCapability={canGenerateS23} />
        </div>

      </CardContent>
    </Card>
  )
}
