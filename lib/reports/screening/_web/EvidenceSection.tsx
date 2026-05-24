/**
 * lib/reports/screening/_web/EvidenceSection.tsx — Bureau coverage + verification checks
 *
 * Mirrors PDF Evidence & Credit section (BureauCoverageMatrix, VerificationCheckTable).
 * Tribunal-match: presents the same verification outcomes and bureau coverage as the PDF.
 * Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §6.4, §6.7, §6.8, Phase F.2.
 */
import type { FitScoreReportData, FitScoreApplicantEntry } from "@/lib/reports/screening/_primitives/theme"
import { SectionLabel, EvidenceRow, normaliseStatus } from "./shared"

// ─── Bureau coverage per applicant ───────────────────────────────────────────

function bureauCoverageLabel(applicant: FitScoreApplicantEntry): string {
  const bureaus = applicant.respondingBureaus
  if (bureaus.length > 0) return `Bureau coverage: ${bureaus.join(', ')}`
  if (applicant.isForeignNational) return 'Bureau coverage: None (foreign applicant — SA bureaus do not hold data)'
  return 'Bureau coverage: None — no bureau responses received'
}

function pleksHistoryLabel(status: string, tenancyCount: number): string {
  if (status === 'trusted') return `Trusted (${tenancyCount} prior tenancy)`
  if (status === 'adverse') return 'Adverse signal on record'
  return 'No Pleks network history'
}

function BureauRow({ applicant }: Readonly<{ applicant: FitScoreApplicantEntry }>) {
  return (
    <div className="py-2 border-b border-border text-sm last:border-0">
      <div className="flex items-baseline justify-between">
        <span className="font-medium">Applicant {applicant.label} — {applicant.fullName}</span>
        <span className="text-xs text-muted-foreground">{applicant.nationalityStatus}</span>
      </div>
      <p className="text-xs text-muted-foreground mt-0.5">
        {bureauCoverageLabel(applicant)}
      </p>
      <p className="text-xs text-muted-foreground">
        Pleks-network history: {pleksHistoryLabel(applicant.pleksNetworkStatus, applicant.pleksNetworkTenancyCount)}
      </p>
    </div>
  )
}

// ─── Verification checks table ────────────────────────────────────────────────

const VERIFICATION_CHECKS = [
  { key: 'identity',   label: 'Identity verification',     note: 'Home Affairs DHA-NPR match' },
  { key: 'employer',   label: 'Employer verification',      note: 'Employer letter or confirmation' },
  { key: 'salary',     label: 'Salary reconciliation',      note: 'Bank deposit vs payslip' },
  { key: 'document',   label: 'Document consistency',       note: 'Cross-document name and ID match' },
  { key: 'bankaccount',label: 'Bank account ownership',     note: 'Account holder name match' },
] as const

interface VerificationStatuses {
  identity: string | null
  employer: string | null
  salary: string | null
  document: string | null
  bankAccount: string | null
}

function VerificationTable({
  applicant, statuses,
}: Readonly<{ applicant: FitScoreApplicantEntry; statuses: VerificationStatuses }>) {
  const statusMap: Record<string, string | null> = {
    identity:    statuses.identity,
    employer:    statuses.employer,
    salary:      statuses.salary,
    document:    statuses.document,
    bankaccount: statuses.bankAccount,
  }
  return (
    <div className="rounded-lg border border-border p-3 mb-3">
      <p className="text-xs font-semibold mb-2">
        Applicant {applicant.label} — {applicant.fullName}
        <span className="ml-2 text-muted-foreground font-normal">
          {applicant.verificationPassCount}/{applicant.verificationTotal} checks passed
        </span>
      </p>
      {VERIFICATION_CHECKS.map(({ key, label, note }) => (
        <EvidenceRow
          key={key}
          label={label}
          status={normaliseStatus(statusMap[key])}
          note={note}
        />
      ))}
    </div>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────

interface EvidenceSectionProps {
  data: FitScoreReportData
  /** Verification status columns for primary applicant */
  primaryStatuses: VerificationStatuses
  /** Per-co-applicant verification statuses (index matches data.applicants[1..]) */
  coStatuses: VerificationStatuses[]
}

export function EvidenceSection({ data, primaryStatuses, coStatuses }: Readonly<EvidenceSectionProps>) {
  const { applicants } = data

  return (
    <div className="space-y-5">
      {/* Bureau coverage */}
      <div>
        <SectionLabel>Bureau Coverage</SectionLabel>
        {applicants.map(a => <BureauRow key={a.label} applicant={a} />)}
      </div>

      {/* Verification checks */}
      <div>
        <SectionLabel>Verification Checks</SectionLabel>
        <VerificationTable applicant={applicants[0]} statuses={primaryStatuses} />
        {coStatuses.map((s, i) => applicants[i + 1] && (
          <VerificationTable key={applicants[i + 1].label} applicant={applicants[i + 1]} statuses={s} />
        ))}
      </div>
    </div>
  )
}
