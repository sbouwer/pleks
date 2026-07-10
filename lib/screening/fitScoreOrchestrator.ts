/**
 * lib/screening/fitScoreOrchestrator.ts — FitScore v1 orchestrator: reads screening data, runs engine, writes results
 *
 * Auth:   internal — called by app/api/cron/screening-line-runner after all subjects are complete
 * Data:   reads applications + application_co_applicants + listings; writes fitscore_* to applications
 * Notes:  Feature-flagged via FITSCORE_V1_ENABLED env var. Idempotent: same inputs hash skips DB write.
 *         Bureau scores and VCCB income read from searchworx_extracted_data JSONB (written by bundle-runner).
 *         Email 7 (application.screening_complete) fires after DB write — non-blocking (void).
 *         Narrative generation via Sonnet 4.6 (lib/screening/fitScoreNarrative.ts) runs between engine and write.
 *         Spec: ADDENDUM_14J_FITSCORE_COMPOSITE.md §§2-5, ADDENDUM_14H_FITSCORE_DELIVERY.md §§7, §10.
 *
 * ─── Known transitional state at Phase C landing ─────────────────────────────
 * The following inputs are hardcoded null/zero because their upstream sources are not yet built.
 * Each will be wired when the named upstream ships — no orchestrator restructuring required.
 *
 * tier1IncomeCents   — ADDENDUM_14D three-way reconciliation (bank+payslip+employer) output.
 *                      Will populate this slot when 14D ships; source changes from the current
 *                      bank_statement_extracted.avg_monthly_income_cents placeholder.
 *                      §4.2 decision (F1-b, 2026-05-21): 14D lands in Tier 1 because it performs
 *                      the three-way reconciliation §4.2 describes for Tier 1.
 *
 * tier2IncomeCents   — Payslip net pay extraction (single-source). No payslip extractor built yet.
 *                      When a payslip pipeline ships independently of 14D, it populates Tier 2.
 *
 * employmentTenureMonths        — "Employed since" date field not yet collected on applicant intake form.
 * addressMoves36Months          — Address history not yet collected on intake form.
 * bankAccountLongevityMonths    — Derivable from bank statement first-transaction date (ADDENDUM_14D).
 * salaryDepositConsistencyMonths — Derivable from ADDENDUM_14D recurring-deposit classification.
 * verifiedRentalReferences      — Reference-checking surface not yet built.
 * secondaryReferencePresent     — Secondary employer reference upload not yet built.
 *
 * Consequence: the Stability dimension (25% SA weight) scores 40/100 for every applicant until
 * at least one Stability signal exists. See §11.19 (Stability data-collection backlog, deferred).
 *
 * nationalityType (co-applicants) — read from id_type ('sa_id'/'passport'/'asylum_permit') rather
 *                      than a full applicant_nationality_type enum because application_co_applicants
 *                      lacks that column (schema asymmetry from BUILD_14 v1). Primary applicant
 *                      reads applicant_nationality_type directly. Co-applicant schema-symmetry pass
 *                      queued as follow-up migration (F3-b decision, 2026-05-21).
 * ─────────────────────────────────────────────────────────────────────────────
 */
import * as Sentry from "@sentry/nextjs"
import { runFitScoreEngine, ENGINE_VERSION } from "@/lib/screening/fitScoreEngine.v1"
import type {
  ApplicantInput,
  BureauScore,
  EngineResult,
  PleksNetworkStatus,
  VerificationStatus,
} from "@/lib/screening/fitScoreEngine.v1"
import { generateFitScoreNarrative, CURRENT_PROMPT_VERSION } from "@/lib/screening/fitScoreNarrative"
import type { NarrativeResponse } from "@/lib/screening/fitScoreNarrative"
import { SYNTHESIS_TEMPLATE_VERSION } from "@/lib/screening/prompts/synthesisTemplate.v1.0"
import { fetchOrgSettings, buildBranding } from "@/lib/comms/send-email"
import { sendScreeningComplete } from "@/lib/applications/emails"
import type { createServiceClient } from "@/lib/supabase/server"
import { getUserEmail } from "@/lib/auth/userEmail"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { assertScreeningConsent } from "@/lib/screening/consentGuard"
import { gitCommitSha } from "@/lib/env"

export const CURRENT_INTERPRETATION_VERSION = 'interpretation.v1.0'
const RUNTIME_CODE_HASH = gitCommitSha()

const APPLICANT_LABELS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mapVerificationStatus(raw: string | null): VerificationStatus {
  if (!raw || raw === 'not_run' || raw === 'not_attempted') return 'not_attempted'
  if (raw === 'verified' || raw === 'pass') return 'pass'
  if (raw === 'failed' || raw === 'mismatch' || raw === 'unverified' || raw === 'fail') return 'fail'
  if (raw === 'pending') return 'pending'
  return 'not_attempted'
}

function mapPleksNetworkStatus(raw: string | null): PleksNetworkStatus {
  if (raw === 'trusted') return 'trusted'
  if (raw === 'adverse') return 'adverse'
  return 'none'
}

// Co-applicants lack applicant_nationality_type — map from id_type instead.
// When the schema-symmetry migration ships (F3-b queued), switch to reading
// applicant_nationality_type directly, consistent with the primary path.
function nationalityFromIdType(idType: string | null): string {
  if (idType === 'sa_id') return 'sa_citizen'
  if (idType === 'permanent_resident') return 'permanent_resident'
  return 'foreign_national'
}

function extractBureauScoresFromJson(json: unknown): BureauScore[] {
  if (!json || typeof json !== 'object') return []
  const raw = (json as Record<string, unknown>).fitscore_bureau_scores
  if (!Array.isArray(raw)) return []
  return raw as BureauScore[]
}

function extractVccbIncomeFromJson(json: unknown): number | null {
  if (!json || typeof json !== 'object') return null
  const raw = (json as Record<string, unknown>).fitscore_vccb_income_gross_cents
  return typeof raw === 'number' ? raw : null
}

// ADDENDUM_14D will write avg_monthly_income_cents here once built.
// Until then this always returns null — Tier 1 stays null in practice.
function extractBankIncome(json: unknown): number | null {
  if (!json || typeof json !== 'object') return null
  const raw = (json as Record<string, unknown>).avg_monthly_income_cents
  return typeof raw === 'number' ? raw : null
}

// ─── Email fire (non-blocking) ─────────────────────────────────────────────────

async function maybeFireScreeningEmail(
  applicationId: string,
  orgId: string,
  appRow: { first_name: string | null; last_name: string | null; applicant_email: string; unit_id: string | null },
  listingId: string,
  rentCents: number,
  result: EngineResult,
  narrative: NarrativeResponse,
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
): Promise<void> {
  // D2: check per-org narrative flag (defaults true)
  const { data: orgRow, error: orgFlagErr } = await supabase
    .from('organisations')
    .select('fitscore_narrative_enabled')
    .eq('id', orgId)
    .single()
  if (orgFlagErr) return
  if ((orgRow as Record<string, unknown> | null)?.fitscore_narrative_enabled === false) return

  // D1(c): LDP only sends if there's an ldpSummary to show
  const isLdp = result.band === 'limited_data_profile'
  if (isLdp && !narrative.ldpSummary) return

  // Fetch org settings (name, branding, email)
  const orgSettings = await fetchOrgSettings(orgId)

  // Fetch agent email from auth.users (not user_profiles — email isn't there); fall back to org email.
  const { data: agentRow, error: agentRowError } = await supabase
    .from('user_orgs')
    .select('user_id')
    .eq('org_id', orgId)
    .in('role', ['agent', 'property_manager', 'owner'])
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle()
    logQueryError("maybeFireScreeningEmail user_orgs", agentRowError)
  const agentEmail = (await getUserEmail(supabase, agentRow?.user_id as string | null)) ?? orgSettings?.email ?? null
  if (!agentEmail) return

  // Fetch unit label and property name
  let unitLabel = ''
  let propertyName = ''
  if (appRow.unit_id) {
    const { data: unitRow, error: unitRowError } = await supabase
      .from('units')
      .select('unit_number, property_id')
      .eq('id', appRow.unit_id)
      .single()
    logQueryError("maybeFireScreeningEmail units", unitRowError)
    if (unitRow) {
      unitLabel = (unitRow.unit_number as string | null) ?? ''
      const { data: propRow, error: propRowError } = await supabase
        .from('properties')
        .select('name')
        .eq('id', unitRow.property_id as string)
        .single()
        logQueryError("maybeFireScreeningEmail properties", propRowError)
      propertyName = (propRow?.name as string | null) ?? ''
    }
  }

  const branding = buildBranding(orgSettings)
  const bandLabel = result.band.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())

  await sendScreeningComplete(
    {
      id: applicationId,
      firstName: appRow.first_name ?? '',
      lastName:  appRow.last_name  ?? '',
      email:     appRow.applicant_email,
    },
    { id: listingId, unitLabel, propertyName, askingRentCents: rentCents },
    {
      orgId,
      orgName:    orgSettings?.name  ?? 'Pleks',
      orgEmail:   orgSettings?.email ?? undefined,
      orgPhone:   orgSettings?.phone ?? undefined,
      agentEmail,
      branding,
    },
    {
      band:                result.band,
      bandLabel,
      score:               result.score,
      confidenceIndex:     result.confidenceIndex,
      verificationIntegrity: result.verificationIntegrity,
      materialFlags:       result.materialFlags,
      narrative,
    },
  )
}

// ─── Orchestrator ─────────────────────────────────────────────────────────────

export async function runFitScoreOrchestrator(
  applicationId: string,
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
): Promise<{ ok: true; result: EngineResult } | { ok: false; reason: string }> {
  if (!process.env.FITSCORE_V1_ENABLED) return { ok: false, reason: 'feature_flag_disabled' }

  // POPIA s11 / BUILD_69 P3: never compute a FitScore for an application without recorded stage-2 consent.
  // Belt over the ready_to_run view-gate (covers any non-cron caller). Throws on breach — loud, never silent.
  await assertScreeningConsent(supabase, { table: 'applications', id: applicationId })

  const computedAt = new Date().toISOString()

  // ── Read primary application ───────────────────────────────────────────────
  const { data: app, error: appErr } = await supabase
    .from('applications')
    .select(`
      id, org_id, listing_id, unit_id, first_name, last_name, applicant_email,
      applicant_nationality_type, is_foreign_national,
      gross_monthly_income_cents, bank_statement_extracted, searchworx_extracted_data,
      income_evidence_tier, identity_match_status, employer_verification_status,
      salary_reconciliation_status, document_consistency_status,
      bank_account_ownership_status, pleks_network_history_status,
      pleks_network_tenancy_count, fitscore_inputs_hash
    `)
    .eq('id', applicationId)
    .single()

  if (appErr || !app) {
    return { ok: false, reason: `application_not_found: ${appErr?.message ?? 'null'}` }
  }

  // ── Read proposed rent from listing ───────────────────────────────────────
  if (!app.listing_id) return { ok: false, reason: 'no_listing_id' }

  const { data: listing, error: listingErr } = await supabase
    .from('listings')
    .select('asking_rent_cents')
    .eq('id', app.listing_id)
    .single()

  if (listingErr || !listing) {
    return { ok: false, reason: `listing_not_found: ${listingErr?.message ?? 'null'}` }
  }
  if (!listing.asking_rent_cents) return { ok: false, reason: 'no_listing_rent' }

  const proposedRentCents = listing.asking_rent_cents

  // ── Read co-applicants (sorted by index) ──────────────────────────────────
  const { data: coApplicants, error: coErr } = await supabase
    .from('application_co_applicants')
    .select(`
      id, id_type, gross_monthly_income_cents, bank_statement_extracted,
      searchworx_extracted_data, identity_match_status, employer_verification_status,
      salary_reconciliation_status, document_consistency_status,
      bank_account_ownership_status, pleks_network_history_status,
      pleks_network_tenancy_count, co_applicant_index
    `)
    .eq('primary_application_id', applicationId)
    .order('co_applicant_index', { ascending: true })

  if (coErr) return { ok: false, reason: `co_applicants_query_failed: ${coErr.message}` }

  // ── Build primary ApplicantInput ───────────────────────────────────────────
  // nationalityType: read the full 9-value enum from applications.applicant_nationality_type.
  // Fallback to is_foreign_national boolean only if the column is null (legacy rows).
  const primaryNationality =
    app.applicant_nationality_type ??
    (app.is_foreign_national ? 'foreign_national' : 'sa_citizen')

  const primaryInput: ApplicantInput = {
    id: app.id,
    label: APPLICANT_LABELS[0],
    nationalityType: primaryNationality,
    tier1IncomeCents: extractBankIncome(app.bank_statement_extracted), // ADDENDUM_14D three-way reconciliation lands here
    tier2IncomeCents: null,                                            // payslip path — not yet built
    tier3IncomeCents: extractVccbIncomeFromJson(app.searchworx_extracted_data),
    tier4IncomeCents: app.gross_monthly_income_cents ?? null,
    bureauScores: extractBureauScoresFromJson(app.searchworx_extracted_data),
    identityMatchStatus: mapVerificationStatus(app.identity_match_status),
    employerConsistencyStatus: mapVerificationStatus(app.employer_verification_status),
    salaryReconciliationStatus: mapVerificationStatus(app.salary_reconciliation_status),
    documentConsistencyStatus: mapVerificationStatus(app.document_consistency_status),
    bankOwnershipStatus: mapVerificationStatus(app.bank_account_ownership_status),
    secondaryReferencePresent: false,
    employmentTenureMonths: null,
    addressMoves36Months: null,
    bankAccountLongevityMonths: null,
    salaryDepositConsistencyMonths: null,
    verifiedRentalReferences: 0,
    pleksNetworkStatus: mapPleksNetworkStatus(app.pleks_network_history_status),
    pleksNetworkTenancyCount: app.pleks_network_tenancy_count ?? 0,
  }

  // ── Build co-applicant ApplicantInputs ────────────────────────────────────
  const coInputs: ApplicantInput[] = (coApplicants ?? []).map((co, idx) => ({
    id: co.id,
    label: APPLICANT_LABELS[idx + 1] ?? `CO${idx + 1}`,
    nationalityType: nationalityFromIdType(co.id_type), // id_type proxy — see header note on F3-b
    tier1IncomeCents: extractBankIncome(co.bank_statement_extracted), // ADDENDUM_14D output lands here
    tier2IncomeCents: null,                                           // payslip path — not yet built
    tier3IncomeCents: extractVccbIncomeFromJson(co.searchworx_extracted_data),
    tier4IncomeCents: co.gross_monthly_income_cents ?? null,
    bureauScores: extractBureauScoresFromJson(co.searchworx_extracted_data),
    identityMatchStatus: mapVerificationStatus(co.identity_match_status),
    employerConsistencyStatus: mapVerificationStatus(co.employer_verification_status),
    salaryReconciliationStatus: mapVerificationStatus(co.salary_reconciliation_status),
    documentConsistencyStatus: mapVerificationStatus(co.document_consistency_status),
    bankOwnershipStatus: mapVerificationStatus(co.bank_account_ownership_status),
    secondaryReferencePresent: false,
    employmentTenureMonths: null,
    addressMoves36Months: null,
    bankAccountLongevityMonths: null,
    salaryDepositConsistencyMonths: null,
    verifiedRentalReferences: 0,
    pleksNetworkStatus: mapPleksNetworkStatus(co.pleks_network_history_status),
    pleksNetworkTenancyCount: co.pleks_network_tenancy_count ?? 0,
  }))

  const allApplicants = [primaryInput, ...coInputs]

  // ── Run deterministic engine ──────────────────────────────────────────────
  const result = runFitScoreEngine({
    applicationId,
    proposedRentCents,
    applicants: allApplicants,
    computedAt,
  })

  // ── Idempotency guard: same inputs → skip write ───────────────────────────
  if (app.fitscore_inputs_hash === result.inputsHash) {
    return { ok: true, result }
  }

  // ── Generate narrative (Sonnet 4.6) ───────────────────────────────────────
  const narrative = await generateFitScoreNarrative(result, allApplicants, app.org_id as string)
  const narrativePromptVersion = narrative.isTemplated ? 'fallback.template.v1' : CURRENT_PROMPT_VERSION

  // F1: append narrative_engine_failed capping flag when the narrative fell back to template.
  // Agents see this in the PDF header flags so they know prose is synthetic, not engine-generated.
  const materialFlags = narrative.isTemplated
    ? [...result.materialFlags, {
        flag: 'narrative_engine_failed',
        class: 'capping' as const,
        capApplied: false,
        capCeiling: null,
        applicantId: null,
        applicantLabel: null,
        description: 'Narrative generation unavailable — templated fallback active.',
        source: 'narrative_engine',
        observedAt: computedAt,
      }]
    : result.materialFlags

  // ── Write FitScore + narrative to applications ────────────────────────────
  const { error: writeErr } = await supabase
    .from('applications')
    .update({
      fitscore:                          result.score,
      fitscore_band:                     result.band,
      fitscore_confidence_index:         result.confidenceIndex,
      fitscore_verification_integrity:   result.verificationIntegrity,
      fitscore_material_flags:           materialFlags,
      fitscore_components:               result.components,
      fitscore_computed_at:              computedAt,
      fitscore_engine_version:           ENGINE_VERSION,
      fitscore_inputs_hash:              result.inputsHash,
      fitscore_component_snapshot:       result.componentSnapshot,
      fitscore_interpretation_version:       CURRENT_INTERPRETATION_VERSION,
      fitscore_narrative_prompt_version:     narrativePromptVersion,
      fitscore_synthesis_template_version:   SYNTHESIS_TEMPLATE_VERSION,
      fitscore_narrative:                    narrative,
      fitscore_runtime_code_hash:        RUNTIME_CODE_HASH,
      stage2_status:                     'screening_complete',
    })
    .eq('id', applicationId)

  if (writeErr) return { ok: false, reason: `fitscore_write_failed: ${writeErr.message}` }

  // ── Email 7: Screening complete — non-blocking ─────────────────────────────
  void maybeFireScreeningEmail(
    applicationId,
    app.org_id as string,
    {
      first_name:      app.first_name as string | null,
      last_name:       app.last_name  as string | null,
      applicant_email: app.applicant_email as string,
      unit_id:         app.unit_id    as string | null,
    },
    app.listing_id as string,
    proposedRentCents,
    result,
    narrative,
    supabase,
  ).catch(err => {
    Sentry.captureException(err, {
      tags: { origin: 'fitscore_orchestrator', step: 'email_fire' },
      extra: { application_id: applicationId },
    })
  })

  return { ok: true, result }
}
