/**
 * lib/reports/screening/agent_multi.tsx — FitScore editorial PDF for multi-applicant leases
 *
 * Auth:   internal — rendered by the PDF generation route (Phase F)
 * Data:   FitScoreReportData assembled by fitScoreOrchestrator and stored in applications.fitscore_*
 * Notes:  Handles co_applicants.count >= 1 for ALL bands including LDP. Extends the §1 Profile
 *         section with AdditionalApplicants below IdentityRow (primary-only row) and above
 *         BandLadder. All other sections are identical to agent_single. Decision-#9 invariant:
 *         no per-applicant scoring UI — composite dimensions remain lease-level.
 *         Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §6.7, §6.9, §10.6.
 */

import { Document }               from "@react-pdf/renderer"
import { DocumentShell }          from "./_pdf/primitives/DocumentShell"
import { EditorialHeadline }      from "./_pdf/primitives/EditorialHeadline"
import { MetaStrip }              from "./_pdf/primitives/MetaStrip"
import { IdentityRow }            from "./_pdf/primitives/IdentityRow"
import { ApplicantDetail }         from "./_pdf/primitives/ApplicantDetail"
import { BandLadder }             from "./_pdf/primitives/BandLadder"
import { DimensionCardEditorial } from "./_pdf/primitives/DimensionCardEditorial"
import { DimensionReadingGuide }  from "./_pdf/primitives/DimensionReadingGuide"
import { IncomeReconciliationTable } from "./_pdf/primitives/IncomeReconciliationTable"
import { ExpenditureTable }          from "./_pdf/primitives/ExpenditureTable"
import { RiskUncertaintySplit }      from "./_pdf/primitives/RiskUncertaintySplit"
import { BureauCoverageMatrix }      from "./_pdf/primitives/BureauCoverageMatrix"
import { VerificationCheckTable }    from "./_pdf/primitives/VerificationCheckTable"
import { ObservedStrengths }         from "./_pdf/primitives/ObservedStrengths"
import { AssessmentSynthesis }       from "./_pdf/primitives/AssessmentSynthesis"
import { DocumentReadingGuide }      from "./_pdf/primitives/DocumentReadingGuide"
import { AttestationCard }           from "./_pdf/primitives/AttestationCard"
import type { FitScoreReportData }   from "./_pdf/primitives/theme"

// ─── Template ─────────────────────────────────────────────────────────────────

export function AgentMultiReport({ data }: Readonly<{ data: FitScoreReportData }>) {
  return (
    <Document
      title={`Pleks FitScore Report - Application ${data.applicationRef}`}
      author="Pleks"
      subject="Rental screening evidence"
      creator={`Pleks FitScore ${data.engineVersion}`}
    >
      <DocumentShell data={data} section="Profile">
        <EditorialHeadline data={data} />
        <MetaStrip data={data} />
        <IdentityRow data={data} />
        <BandLadder data={data} />
        <ApplicantDetail applicants={data.applicants} />
        <DimensionCardEditorial data={data} />
        <DimensionReadingGuide />
      </DocumentShell>

      <DocumentShell data={data} section="Financial Analysis">
        <IncomeReconciliationTable data={data} />
        <ExpenditureTable data={data} />
        <RiskUncertaintySplit data={data} />
      </DocumentShell>

      <DocumentShell data={data} section="Evidence & Credit">
        <BureauCoverageMatrix data={data} />
        <VerificationCheckTable data={data} />
      </DocumentShell>

      <DocumentShell data={data} section="Narrative">
        <ObservedStrengths data={data} />
        <AssessmentSynthesis data={data} />
      </DocumentShell>

      <DocumentShell data={data} section="Document Attestation">
        <DocumentReadingGuide />
        <AttestationCard data={data} />
      </DocumentShell>
    </Document>
  )
}
