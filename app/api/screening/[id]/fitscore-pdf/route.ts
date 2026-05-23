/**
 * app/api/screening/[id]/fitscore-pdf/route.ts — Stream 2 FitScore PDF download for agent use
 *
 * Auth:   agent workspace (gateway — org scoped)
 * Data:   reads applications + application_co_applicants + organisations
 * Notes:  Routes to agent_single / agent_multi / agent_limited_data by band + co-applicant count.
 *         Requires fitscore_band to be set (orchestrator must have run).
 *         Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §10.7.
 */
import { renderToBuffer } from "@react-pdf/renderer"
import type { DocumentProps } from "@react-pdf/renderer"
import { createElement } from "react"
import type { ReactElement } from "react"
import { gateway } from "@/lib/supabase/gateway"
import { isForeignNational, getPreferredThresholds } from "@/lib/screening/fitScoreEngine.v1"
import type { MaterialFlag, FitScoreBand, ConfidenceGrade, VerificationIntegrityGrade } from "@/lib/screening/fitScoreEngine.v1"
import type { NarrativeResponse } from "@/lib/screening/fitScoreNarrative"
import { AgentSingleReport } from "@/lib/reports/screening/agent_single"
import { AgentMultiReport } from "@/lib/reports/screening/agent_multi"
import { AgentLimitedDataReport } from "@/lib/reports/screening/agent_limited_data"
import type { FitScoreReportData, FitScoreApplicantEntry } from "@/lib/reports/screening/_primitives/theme"

export const dynamic = "force-dynamic"

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function natLabel(t: string): string {
  return NATIONALITY_LABELS[t] ?? t.replaceAll('_', ' ')
}

function countPasses(statuses: (string | null | undefined)[]): number {
  return statuses.filter(s => s === 'pass' || s === 'verified').length
}

function coNatFromIdType(idType: string | null): string {
  if (idType === 'sa_id') return 'sa_citizen'
  if (idType === 'permanent_resident') return 'sa_permanent_resident'
  return 'foreign_national'
}

type NetworkStatus = 'trusted' | 'adverse' | 'none'
function toNetworkStatus(raw: string | null | undefined): NetworkStatus {
  if (raw === 'trusted' || raw === 'adverse') return raw
  return 'none'
}

type BureauProcessing = { responding: string[]; outliers: string[] }
type AppSnap = { bureauProcessing: BureauProcessing; verifiedIncomeCents: number; incomeSharePct: number }

function filterBureaus(snap: AppSnap | undefined): string[] {
  if (!snap) return []
  return snap.bureauProcessing.responding.filter(b => !snap.bureauProcessing.outliers.includes(b))
}

function selectTemplate(data: FitScoreReportData, coCount: number): ReactElement<DocumentProps> {
  if (data.isLdp) return createElement(AgentLimitedDataReport, { data }) as unknown as ReactElement<DocumentProps>
  if (coCount > 0) return createElement(AgentMultiReport, { data }) as unknown as ReactElement<DocumentProps>
  return createElement(AgentSingleReport, { data }) as unknown as ReactElement<DocumentProps>
}

const APPLICANT_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const

// ─── Route ────────────────────────────────────────────────────────────────────

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const gw = await gateway()
  if (!gw) return new Response('Unauthorized', { status: 401 })
  const { db, orgId } = gw
  const { id } = await params

  const { data: app, error: appErr } = await db
    .from('applications')
    .select(`
      id, org_id, first_name, last_name,
      applicant_nationality_type, is_foreign_national,
      identity_match_status, employer_verification_status,
      salary_reconciliation_status, document_consistency_status,
      bank_account_ownership_status, pleks_network_history_status,
      pleks_network_tenancy_count,
      fitscore, fitscore_band, fitscore_confidence_index,
      fitscore_verification_integrity, fitscore_material_flags,
      fitscore_components, fitscore_component_snapshot,
      fitscore_computed_at, fitscore_engine_version,
      fitscore_narrative_prompt_version, fitscore_interpretation_version,
      fitscore_synthesis_template_version,
      fitscore_narrative, fitscore_inputs_hash,
      listings(asking_rent_cents, units(unit_number, properties(name)))
    `)
    .eq('id', id)
    .eq('org_id', orgId)
    .single()

  if (appErr || !app) return new Response('Not found', { status: 404 })
  if (!app.fitscore_band) return new Response('FitScore not yet computed', { status: 422 })

  const { data: coApplicants } = await db
    .from('application_co_applicants')
    .select(`
      id, id_type, first_name, last_name,
      identity_match_status, employer_verification_status,
      salary_reconciliation_status, document_consistency_status,
      bank_account_ownership_status, pleks_network_history_status,
      pleks_network_tenancy_count, co_applicant_index
    `)
    .eq('primary_application_id', id)
    .order('co_applicant_index', { ascending: true })

  const { data: orgRow } = await db
    .from('organisations')
    .select('name')
    .eq('id', orgId)
    .single()

  const listing = app.listings as unknown as {
    asking_rent_cents: number
    units: { unit_number: string; properties: { name: string } }
  } | null

  const rawSnap = app.fitscore_component_snapshot as { applicants: AppSnap[] } | null
  const narrative: NarrativeResponse | null = app.fitscore_narrative
  const materialFlags = (app.fitscore_material_flags ?? []) as MaterialFlag[]
  const components = app.fitscore_components as {
    affordability: number
    stability: number
    creditBehaviour: number | null
    verificationIntegrity: number
  } | null

  if (!rawSnap || !narrative || !components) {
    return new Response('Incomplete FitScore data', { status: 422 })
  }

  const primaryNat = (app.applicant_nationality_type as string | null) ??
    (app.is_foreign_national ? 'foreign_national' : 'sa_citizen')

  const primaryEntry: FitScoreApplicantEntry = {
    label: 'A',
    fullName: `${app.first_name ?? ''} ${app.last_name ?? ''}`.trim() || 'Primary Applicant',
    nationalityStatus: natLabel(primaryNat),
    idNumberMasked:   '',   // not yet surfaced in route assembly; set by report orchestrator
    sex:              null,
    ageYears:         null,
    employment:       null,
    verifiedIncomeCents: rawSnap.applicants[0]?.verifiedIncomeCents ?? 0,
    incomeSharePct:      rawSnap.applicants[0]?.incomeSharePct ?? 100,
    verificationPassCount: countPasses([
      app.identity_match_status, app.employer_verification_status,
      app.salary_reconciliation_status, app.document_consistency_status,
      app.bank_account_ownership_status,
    ]),
    verificationTotal: 5,
    respondingBureaus: filterBureaus(rawSnap.applicants[0]),
    pleksNetworkStatus: toNetworkStatus(app.pleks_network_history_status),
    pleksNetworkTenancyCount: (app.pleks_network_tenancy_count as number | null) ?? 0,
    isForeignNational: isForeignNational(primaryNat),
  }

  const coEntries: FitScoreApplicantEntry[] = (coApplicants ?? []).map((co, idx) => {
    const coNat = coNatFromIdType(co.id_type)
    const coLabel = APPLICANT_LABELS[idx + 1] ?? `CO${idx + 1}`
    return {
      label:            coLabel,
      fullName:         `${co.first_name ?? ''} ${co.last_name ?? ''}`.trim() || `Applicant ${coLabel}`,
      nationalityStatus: natLabel(coNat),
      idNumberMasked:   '',
      sex:              null,
      ageYears:         null,
      employment:       null,
      verifiedIncomeCents: rawSnap.applicants[idx + 1]?.verifiedIncomeCents ?? 0,
      incomeSharePct:      rawSnap.applicants[idx + 1]?.incomeSharePct ?? 0,
      verificationPassCount: countPasses([
        co.identity_match_status, co.employer_verification_status,
        co.salary_reconciliation_status, co.document_consistency_status,
        co.bank_account_ownership_status,
      ]),
      verificationTotal: 5,
      respondingBureaus: filterBureaus(rawSnap.applicants[idx + 1]),
      pleksNetworkStatus: toNetworkStatus(co.pleks_network_history_status),
      pleksNetworkTenancyCount: (co.pleks_network_tenancy_count as number | null) ?? 0,
      isForeignNational: isForeignNational(coNat),
    }
  })

  const allApplicants = [primaryEntry, ...coEntries]
  const band = app.fitscore_band as FitScoreBand
  const isAllForeign = allApplicants.every(a => a.isForeignNational)
  const prefThresholds = getPreferredThresholds(isAllForeign)

  const data: FitScoreReportData = {
    applicationRef: app.id,
    unitLabel: listing
      ? `Unit ${listing.units.unit_number}, ${listing.units.properties.name}`
      : 'Unknown unit',
    generatedAt:  (app.fitscore_computed_at as string | null) ?? new Date().toISOString(),
    submittedAt:  (app.fitscore_computed_at as string | null) ?? new Date().toISOString(),
    primaryApplicantName: primaryEntry.fullName,
    coApplicantCount:     coEntries.length,
    applicants:           allApplicants,
    leaseIntent: {
      termMonths:         12,
      monthlyRentCents:   listing?.asking_rent_cents ?? 0,
      depositMultiplier:  1,
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
    materialFlags,
    isLdp:                band === 'limited_data_profile',
    isAllForeignNational: isAllForeign,
    narrative,
    engineVersion:         (app.fitscore_engine_version as string | null) ?? 'fitscore.v1.0',
    narrativeVersion:      (app.fitscore_narrative_prompt_version as string | null) ?? 'narr.v1.0',
    interpretationVersion: (app.fitscore_interpretation_version as string | null) ?? 'interpretation.v1.0',
    synthesisVersion:      (app.fitscore_synthesis_template_version as string | null) ?? 'synthesis.v1.0',
    inputsHash:           (app.fitscore_inputs_hash as string | null) ?? '',
    orgName:              orgRow?.name ?? 'Pleks',
    orgFfcNumber:         null,
    dimensions: {
      affordability: { rentToIncomePct: 0, windowMonths: 3 },
      stability:     { currentTenureDisplay: 'N/A', employersIn7Years: 0 },
      credit:        { bureauCoverageDisplay: '0 / 3', divergencePoints: null },
      verification:  { checksPassedDisplay: '0 / 5', manualOverridesPending: 0, auditEntriesCount: 0 },
    },
  }

  let buffer: Buffer
  try {
    buffer = await renderToBuffer(selectTemplate(data, coEntries.length))
  } catch (err) {
    const e = err instanceof Error ? err : new Error(String(err))
    console.error('[fitscore-pdf] renderToBuffer failed:', e.message)
    return new Response('PDF generation failed', { status: 500 })
  }

  const filename = `Pleks-FitScore-${app.id.slice(0, 8)}.pdf`
  return new Response(new Uint8Array(buffer), {
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control':       'no-store',
    },
  })
}
