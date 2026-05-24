/**
 * app/(dashboard)/applications/[id]/_components/FitScoreSection.tsx — Stream 2 FitScore report surface
 *
 * Auth:   agent workspace (server component — data assembled by parent page)
 * Data:   FitScoreReportData passed from page.tsx (assembled via assembleReportData.ts)
 * Notes:  Full-report surface mirroring the PDF sections for Tribunal-match parity.
 *         Sections: Profile → Financial Analysis → Evidence & Verification → Narrative → Applicant Roster → Provenance
 *         LDP state renders a distinct layout (no composite, no dimensions).
 *         Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §6, Phase F.2.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import type { FitScoreReportData } from "@/lib/reports/screening/_primitives/theme"
import { SectionNav }       from "@/lib/reports/screening/_web/SectionNav"
import { ProfileSection }   from "@/lib/reports/screening/_web/ProfileSection"
import { FinancialSection } from "@/lib/reports/screening/_web/FinancialSection"
import { EvidenceSection }  from "@/lib/reports/screening/_web/EvidenceSection"
import { NarrativeSection } from "@/lib/reports/screening/_web/NarrativeSection"
import { ApplicantRoster }  from "@/lib/reports/screening/_web/ApplicantRoster"
import { ProvenanceSection } from "@/lib/reports/screening/_web/ProvenanceSection"
import { LdpReport }        from "@/lib/reports/screening/_web/LdpReport"
import { ReportDivider }    from "@/lib/reports/screening/_web/shared"
import { PopiaResponseAction } from "./PopiaResponseAction"

interface VerificationStatuses {
  identity:    string | null
  employer:    string | null
  salary:      string | null
  document:    string | null
  bankAccount: string | null
}

interface Props {
  data: FitScoreReportData
  applicationId: string
  canGenerateS23: boolean
  /** Verification status columns for primary applicant */
  primaryStatuses: VerificationStatuses
  /** Per-co-applicant verification statuses (index-aligned to data.applicants[1..]) */
  coStatuses: VerificationStatuses[]
}

const SCORED_SECTIONS = [
  { id: 'fs-profile',   label: 'Profile' },
  { id: 'fs-financial', label: 'Financial Analysis' },
  { id: 'fs-evidence',  label: 'Evidence & Verification' },
  { id: 'fs-narrative', label: 'Narrative' },
  { id: 'fs-provenance',label: 'Provenance' },
]

const LDP_SECTIONS = [
  { id: 'fs-profile',   label: 'Profile' },
  { id: 'fs-provenance',label: 'Provenance' },
]

export function FitScoreSection({
  data, applicationId, canGenerateS23, primaryStatuses, coStatuses,
}: Readonly<Props>) {
  const { isLdp, applicants } = data
  const sections = isLdp ? LDP_SECTIONS : SCORED_SECTIONS

  return (
    <Card className="mt-6 overflow-hidden">
      <CardHeader className="pb-0">
        <CardTitle className="text-lg">FitScore Report (Stage 2)</CardTitle>
      </CardHeader>

      {/* Sticky section nav */}
      <div className="px-6">
        <SectionNav sections={sections} />
      </div>

      <CardContent className="space-y-0 pt-5">

        {/* ── LDP alternative layout ─────────────────────────── */}
        {isLdp && (
          <>
            <section id="fs-profile">
              <LdpReport data={data} />
            </section>
            <ReportDivider />
            <section id="fs-provenance">
              <ProvenanceSection data={data} />
            </section>
          </>
        )}

        {/* ── Standard scored layout ─────────────────────────── */}
        {!isLdp && (
          <>
            {/* Profile */}
            <section id="fs-profile">
              <ProfileSection data={data} />
            </section>

            <ReportDivider />

            {/* Financial Analysis */}
            <section id="fs-financial">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Financial Analysis
              </p>
              <FinancialSection data={data} />
            </section>

            <ReportDivider />

            {/* Evidence & Verification */}
            <section id="fs-evidence">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Evidence & Verification
              </p>
              <EvidenceSection
                data={data}
                primaryStatuses={primaryStatuses}
                coStatuses={coStatuses}
              />
            </section>

            <ReportDivider />

            {/* Narrative */}
            <section id="fs-narrative">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Narrative
              </p>
              <NarrativeSection narrative={data.narrative} />
            </section>

            {/* Applicant roster — multi only */}
            {applicants.length > 1 && (
              <>
                <ReportDivider />
                <section>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                    Applicant Roster
                  </p>
                  <ApplicantRoster applicants={applicants} />
                </section>
              </>
            )}

            <ReportDivider />

            {/* Provenance & Attestation */}
            <section id="fs-provenance">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Provenance & Attestation
              </p>
              <ProvenanceSection data={data} />
            </section>
          </>
        )}

        {/* POPIA s23 action — always shown */}
        <div className="border-t border-border pt-4 mt-5 flex items-center justify-end">
          <PopiaResponseAction applicationId={applicationId} hasCapability={canGenerateS23} />
        </div>

      </CardContent>
    </Card>
  )
}
