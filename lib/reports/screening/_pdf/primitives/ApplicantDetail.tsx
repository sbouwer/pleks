/**
 * lib/reports/screening/_pdf/primitives/ApplicantDetail.tsx
 *
 * §1 editorial chrome — thin mode dispatcher for multi-applicant participant detail.
 * Delegates to per-mode primitives: interpretive (N=2), summary (N=3), comparative (N=4),
 * operational (N>=5). Returns null for single-applicant leases.
 * Spec: ADDENDUM_14U_DENSITY_SURFACE_PASS §4.5/§10.3; mode files: ApplicantDetail/{mode}/.
 */
import { ApplicantDetailInterpretive } from "./ApplicantDetail/interpretive/ApplicantDetailInterpretive"
import { ApplicantDetailSummary }      from "./ApplicantDetail/summary/ApplicantDetailSummary"
import { ApplicantDetailComparative }  from "./ApplicantDetail/comparative/ApplicantDetailComparative"
import { ApplicantDetailOperational }  from "./ApplicantDetail/operational/ApplicantDetailOperational"
import type { FitScoreApplicantEntry } from "./theme"

type ApplicantDetailMode = 'interpretive' | 'summary' | 'comparative' | 'operational'

function modeFor(n: number): ApplicantDetailMode {
  if (n === 2) return 'interpretive'
  if (n === 3) return 'summary'
  if (n === 4) return 'comparative'
  return 'operational'
}

interface ApplicantDetailProps {
  applicants: FitScoreApplicantEntry[]
}

export function ApplicantDetail({ applicants }: Readonly<ApplicantDetailProps>) {
  if (applicants.length < 2) return null
  const mode = modeFor(applicants.length)
  switch (mode) {
    case 'interpretive': return <ApplicantDetailInterpretive applicants={applicants} />
    case 'summary':      return <ApplicantDetailSummary      applicants={applicants} />
    case 'comparative':  return <ApplicantDetailComparative  applicants={applicants} />
    case 'operational':  return <ApplicantDetailOperational  applicants={applicants} />
  }
}
