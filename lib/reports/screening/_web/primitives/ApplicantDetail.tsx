/**
 * lib/reports/screening/_web/primitives/ApplicantDetail.tsx — thin mode dispatcher
 *
 * Notes:  Web parity for _pdf/primitives/ApplicantDetail.tsx.
 *         Delegates to per-mode primitives: interpretive (N=2), summary (N=3),
 *         comparative (N=4), operational (N>=5). Returns null for single-applicant leases.
 *         Spec: ADDENDUM_14U_DENSITY_SURFACE_PASS §4.5/§10.3.
 */
import type { JSX } from "react"
import type { FitScoreApplicantEntry } from "@/lib/reports/screening/_primitives/theme"
import { ApplicantDetailInterpretive } from "./ApplicantDetail/interpretive/ApplicantDetailInterpretive"
import { ApplicantDetailSummary }      from "./ApplicantDetail/summary/ApplicantDetailSummary"
import { ApplicantDetailComparative }  from "./ApplicantDetail/comparative/ApplicantDetailComparative"
import { ApplicantDetailOperational }  from "./ApplicantDetail/operational/ApplicantDetailOperational"

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

export function ApplicantDetail({ applicants }: Readonly<ApplicantDetailProps>): JSX.Element | null {
  if (applicants.length < 2) return null
  const mode = modeFor(applicants.length)
  switch (mode) {
    case 'interpretive': return <ApplicantDetailInterpretive applicants={applicants} />
    case 'summary':      return <ApplicantDetailSummary      applicants={applicants} />
    case 'comparative':  return <ApplicantDetailComparative  applicants={applicants} />
    case 'operational':  return <ApplicantDetailOperational  applicants={applicants} />
  }
}
