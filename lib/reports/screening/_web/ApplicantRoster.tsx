/**
 * lib/reports/screening/_web/ApplicantRoster.tsx — Multi-applicant roster (§6.7)
 *
 * Mirrors PDF ApplicantRoster primitive. Shown for multi-applicant leases only.
 * No per-applicant band or composite — Decision #9 prohibition.
 * Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §6.7, Phase F.2.
 */
import { formatZAR } from "@/lib/constants"
import type { FitScoreApplicantEntry } from "@/lib/reports/screening/_primitives/theme"

function pleksNetworkLabel(status: string, tenancyCount: number): string {
  if (status === 'trusted') return `Trusted — ${tenancyCount} prior tenancy`
  if (status === 'adverse') return 'Adverse signal on record'
  return 'No history'
}

function RosterRow({ applicant }: Readonly<{ applicant: FitScoreApplicantEntry }>) {
  const bureaus = applicant.respondingBureaus
  return (
    <div className="py-3 border-b border-border text-sm last:border-0">
      <div className="flex items-baseline justify-between mb-1">
        <span className="font-semibold">Applicant {applicant.label} — {applicant.fullName}</span>
        <span className="text-xs text-muted-foreground">{applicant.nationalityStatus}</span>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-0.5 text-xs text-muted-foreground">
        <span>
          Verified income: {formatZAR(applicant.verifiedIncomeCents)}/mo ({Math.round(applicant.incomeSharePct)}% of joint)
        </span>
        <span>
          Verification: {applicant.verificationPassCount}/{applicant.verificationTotal} checks passed
        </span>
        <span>
          {bureaus.length > 0 ? `Bureau coverage: ${bureaus.join(', ')}` : 'Bureau coverage: None'}
        </span>
        <span>
          Pleks network: {pleksNetworkLabel(applicant.pleksNetworkStatus, applicant.pleksNetworkTenancyCount)}
        </span>
      </div>
    </div>
  )
}

export function ApplicantRoster({ applicants }: Readonly<{ applicants: FitScoreApplicantEntry[] }>) {
  return (
    <div>
      {applicants.map(a => <RosterRow key={a.label} applicant={a} />)}
    </div>
  )
}
