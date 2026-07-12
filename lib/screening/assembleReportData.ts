/**
 * lib/screening/assembleReportData.ts — Shared FitScoreReportData assembly
 *
 * Used by:
 *   - app/api/screening/[id]/fitscore-pdf/route.ts  (PDF download)
 *   - app/(dashboard)/listings/[slug]/applications/[id]/page.tsx    (dashboard surface)
 *
 * Assembles the canonical FitScoreReportData object from raw DB rows so the
 * PDF and dashboard always present identical information content (Tribunal-match).
 * Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §10.7, Phase F.2.
 */

import { isForeignNational, getPreferredThresholds } from "@/lib/screening/fitScoreEngine.v1"
import { formatPropertyLabel } from "@/lib/properties/propertyLabel"
import type { MaterialFlag, FitScoreBand, ConfidenceGrade, VerificationIntegrityGrade } from "@/lib/screening/fitScoreEngine.v1"
import type { NarrativeResponse } from "@/lib/screening/fitScoreNarrative"
import type { FitScoreReportData, FitScoreApplicantEntry } from "@/lib/reports/screening/_primitives/theme"

// ─── Nationality label map ────────────────────────────────────────────────────

const NATIONALITY_LABELS: Record<string, string> = {
  sa_citizen:              'SA Citizen',
  sa_permanent_resident:   'Permanent Resident',
  foreign_work_permit:     'Foreign National (Work Permit)',
  foreign_study_permit:    'Foreign National (Study Permit)',
  foreign_business_permit: 'Foreign National (Business Permit)',
  foreign_retired_permit:  'Foreign National (Retired Permit)',
  foreign_other_permit:    'Foreign National (Other Permit)',
  naturalising:            'Naturalising',
  asylum_seeker:           'Asylum Seeker',
  foreign_national:        'Foreign National',
  permanent_resident:      'Permanent Resident',
}

export function natLabel(t: string | null | undefined): string {
  if (!t) return 'Unknown'
  return NATIONALITY_LABELS[t] ?? t.replaceAll('_', ' ')
}

const APPLICANT_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const

// ─── Verification pass count ──────────────────────────────────────────────────

export function countPasses(statuses: (string | null | undefined)[]): number {
  return statuses.filter(s => s === 'pass' || s === 'verified').length
}

// ─── Bureau list from snapshot ────────────────────────────────────────────────

type BureauProcessing = { responding: string[]; outliers: string[] }
type AppSnap = { bureauProcessing: BureauProcessing; verifiedIncomeCents: number; incomeSharePct: number }

export function filterBureaus(snap: AppSnap | undefined): string[] {
  if (!snap) return []
  return snap.bureauProcessing.responding.filter(b => !snap.bureauProcessing.outliers.includes(b))
}

type NetworkStatus = 'trusted' | 'adverse' | 'none'
export function toNetworkStatus(raw: string | null | undefined): NetworkStatus {
  if (raw === 'trusted' || raw === 'adverse') return raw
  return 'none'
}

// ─── Input types (subset of DB row columns needed for assembly) ───────────────

export interface AppRowForReport {
  id: string
  first_name: string | null
  last_name: string | null
  applicant_nationality_type: string | null
  is_foreign_national: boolean
  identity_match_status: string | null
  employer_verification_status: string | null
  salary_reconciliation_status: string | null
  document_consistency_status: string | null
  bank_account_ownership_status: string | null
  pleks_network_history_status: string | null
  pleks_network_tenancy_count: unknown
  fitscore: number | null
  fitscore_band: string | null
  fitscore_confidence_index: string | null
  fitscore_verification_integrity: string | null
  fitscore_material_flags: unknown
  fitscore_components: unknown
  fitscore_component_snapshot: unknown
  fitscore_narrative: unknown
  fitscore_computed_at: unknown
  fitscore_engine_version: unknown
  fitscore_narrative_prompt_version: unknown
  fitscore_interpretation_version: unknown
  fitscore_synthesis_template_version: unknown
  fitscore_inputs_hash: unknown
  listings: unknown
}

export interface CoApplicantRowForReport {
  id: string
  first_name: string | null
  last_name: string | null
  id_type: string | null
  co_applicant_index: number
  identity_match_status: string | null
  employer_verification_status: string | null
  salary_reconciliation_status: string | null
  document_consistency_status: string | null
  bank_account_ownership_status: string | null
  pleks_network_history_status: string | null
  pleks_network_tenancy_count: unknown
}

// ─── Assembly ─────────────────────────────────────────────────────────────────

function coNatFromIdType(idType: string | null): string {
  if (idType === 'sa_id') return 'sa_citizen'
  if (idType === 'permanent_resident') return 'sa_permanent_resident'
  return 'foreign_national'
}

export function assembleReportData(
  app: AppRowForReport,
  coApplicants: CoApplicantRowForReport[],
  orgName: string,
): FitScoreReportData | null {
  const band = app.fitscore_band as FitScoreBand | null
  if (!band) return null

  const rawSnap = app.fitscore_component_snapshot as { applicants: AppSnap[] } | null
  const narrative = app.fitscore_narrative as NarrativeResponse | null
  const components = app.fitscore_components as {
    affordability: number
    stability: number
    creditBehaviour: number | null
    verificationIntegrity: number
  } | null

  if (!rawSnap || !narrative || !components) return null

  const primaryNat = (app.applicant_nationality_type as string | null) ??
    (app.is_foreign_national ? 'foreign_national' : 'sa_citizen')

  const primaryEntry: FitScoreApplicantEntry = {
    label:             'A',
    fullName:          `${app.first_name ?? ''} ${app.last_name ?? ''}`.trim() || 'Primary Applicant',
    nationalityStatus: natLabel(primaryNat),
    idNumberMasked:    '',
    sex:               null,
    ageYears:          null,
    employment:        null,
    verifiedIncomeCents:   rawSnap.applicants[0]?.verifiedIncomeCents ?? 0,
    incomeSharePct:        rawSnap.applicants[0]?.incomeSharePct ?? 100,
    verificationPassCount: countPasses([
      app.identity_match_status, app.employer_verification_status,
      app.salary_reconciliation_status, app.document_consistency_status,
      app.bank_account_ownership_status,
    ]),
    verificationTotal:     5,
    respondingBureaus:     filterBureaus(rawSnap.applicants[0]),
    pleksNetworkStatus:    toNetworkStatus(app.pleks_network_history_status),
    pleksNetworkTenancyCount: (app.pleks_network_tenancy_count as number | null) ?? 0,
    isForeignNational:     isForeignNational(primaryNat),
  }

  const coEntries: FitScoreApplicantEntry[] = coApplicants.map((co, idx) => {
    const coNat   = coNatFromIdType(co.id_type)
    const coLabel = APPLICANT_LABELS[idx + 1] ?? `CO${idx + 1}`
    return {
      label:             coLabel,
      fullName:          `${co.first_name ?? ''} ${co.last_name ?? ''}`.trim() || `Applicant ${coLabel}`,
      nationalityStatus: natLabel(coNat),
      idNumberMasked:    '',
      sex:               null,
      ageYears:          null,
      employment:        null,
      verifiedIncomeCents:   rawSnap.applicants[idx + 1]?.verifiedIncomeCents ?? 0,
      incomeSharePct:        rawSnap.applicants[idx + 1]?.incomeSharePct ?? 0,
      verificationPassCount: countPasses([
        co.identity_match_status, co.employer_verification_status,
        co.salary_reconciliation_status, co.document_consistency_status,
        co.bank_account_ownership_status,
      ]),
      verificationTotal:     5,
      respondingBureaus:     filterBureaus(rawSnap.applicants[idx + 1]),
      pleksNetworkStatus:    toNetworkStatus(co.pleks_network_history_status),
      pleksNetworkTenancyCount: (co.pleks_network_tenancy_count as number | null) ?? 0,
      isForeignNational:     isForeignNational(coNat),
    }
  })

  const allApplicants = [primaryEntry, ...coEntries]
  const isAllForeign  = allApplicants.every(a => a.isForeignNational)
  const prefThresholds = getPreferredThresholds(isAllForeign)

  const listing = app.listings as {
    asking_rent_cents: number
    units: { unit_number: string; properties: { name: string } }
  } | null

  return {
    applicationRef:      app.id,
    unitLabel:           listing ? `Unit ${formatPropertyLabel(listing.units, { fallback: "—" })}` : 'Unknown unit',
    generatedAt:         (app.fitscore_computed_at as string | null) ?? new Date().toISOString(),
    submittedAt:         (app.fitscore_computed_at as string | null) ?? new Date().toISOString(),
    primaryApplicantName: primaryEntry.fullName,
    coApplicantCount:     coEntries.length,
    applicants:           allApplicants,
    leaseIntent: {
      termMonths:       12,
      monthlyRentCents: listing?.asking_rent_cents ?? 0,
      depositMultiplier: 1,
    },
    band,
    score:                app.fitscore as number | null,
    confidenceIndex:      app.fitscore_confidence_index as ConfidenceGrade,
    verificationIntegrity: app.fitscore_verification_integrity as VerificationIntegrityGrade,
    dimensionalScores: {
      ...components,
      affordability_preferred_threshold:         prefThresholds.affordability,
      stability_preferred_threshold:             prefThresholds.stability,
      creditBehaviour_preferred_threshold:       prefThresholds.creditBehaviour,
      verificationIntegrity_preferred_threshold: prefThresholds.verificationIntegrity,
    },
    materialFlags: (app.fitscore_material_flags ?? []) as MaterialFlag[],
    isLdp:               band === 'limited_data_profile',
    isAllForeignNational: isAllForeign,
    narrative,
    engineVersion:         (app.fitscore_engine_version as string | null) ?? 'fitscore.v1.0',
    narrativeVersion:      (app.fitscore_narrative_prompt_version as string | null) ?? 'narr.v1.0',
    interpretationVersion: (app.fitscore_interpretation_version as string | null) ?? 'interpretation.v1.0',
    synthesisVersion:      (app.fitscore_synthesis_template_version as string | null) ?? 'synthesis.v1.0',
    inputsHash:            (app.fitscore_inputs_hash as string | null) ?? '',
    orgName,
    orgFfcNumber:          null,
    dimensions: {
      affordability: { rentToIncomePct: 0, windowMonths: 3 },
      stability:     { currentTenureDisplay: 'N/A', employersIn7Years: 0 },
      credit:        { bureauCoverageDisplay: `${allApplicants.flatMap(a => a.respondingBureaus).filter((b, i, arr) => arr.indexOf(b) === i).length} / 3`, divergencePoints: null },
      verification:  { checksPassedDisplay: `${primaryEntry.verificationPassCount} / ${primaryEntry.verificationTotal}`, manualOverridesPending: 0, auditEntriesCount: 0 },
    },
    // financialAnalysis: undefined (ADDENDUM_14D not yet built)
    // creditAnalysis: undefined (not yet built)
  }
}
