/**
 * scripts/render-density-pass.ts — Density-pass fixture render: 15 PDFs + 15 HTMLs + 4×2 Lock 2 shared renders
 *
 * Run:    npm run render:density-pass
 * Output: lib/reports/screening/__samples__/density-pass/{fixtures,pdf,web,lock2-shared}/
 *
 * Notes:  Validates ADDENDUM_14H_DENSITY_SURFACE_PASS per-mode dispatch (interpretive/summary/
 *         comparative/operational), MethodologyEyebrow presence/absence (D-DSP-16/17/21), and
 *         DimensionCardEditorial three-case dispatch (D-DSP-15/20). All 15 fixtures have N>=2
 *         applicants — single-applicant cases are covered by render:fitscore-samples.
 *         Web HTML snapshots render the density-pass section (ApplicantDetail + MethodologyEyebrow +
 *         DimensionCardEditorial) for structural/doctrinal review; styling is approximate (Tailwind CDN).
 *         Spec: ADDENDUM_14H_DENSITY_SURFACE_PASS §7.2 (fixture matrix), §10.4 (Phase 3 acceptance).
 */
import { renderToBuffer }       from "@react-pdf/renderer"
import { renderToStaticMarkup } from "react-dom/server"
import { createElement }        from "react"
import { writeFileSync, mkdirSync } from "node:fs"
import path from "node:path"

import { AgentMultiReport } from "@/lib/reports/screening/agent_multi"
import { ApplicantDetail as WebApplicantDetail }
  from "@/lib/reports/screening/_web/primitives/ApplicantDetail"
import { MethodologyEyebrow as WebMethodologyEyebrow }
  from "@/lib/reports/screening/_web/primitives/MethodologyEyebrow"
import { DimensionCardEditorial as WebDimCard }
  from "@/lib/reports/screening/_web/primitives/DimensionCardEditorial"
import type {
  FitScoreReportData,
  FitScoreApplicantEntry,
  MaterialFlag,
  NarrativeResponse,
} from "@/lib/reports/screening/_primitives/theme"

const BASE   = path.resolve(process.cwd(), 'lib/reports/screening/__samples__/density-pass')
const DIRS   = ['fixtures', 'pdf', 'web', 'lock2-shared']

// ─── Narrative bank (density-pass variants) ────────────────────────────────────

const OBS_AFFORD_SP  = ['Rent-to-income at 26% — within preferred threshold.', 'Debt servicing stable across the observation window.', 'No material income variance from bank-verified figure.']
const OBS_AFFORD_VS  = ['Rent-to-income at 23% — well below preferred threshold.', 'Debt servicing low relative to verified income.', 'No income discrepancy detected.']
const OBS_AFFORD_CR  = ['Rent-to-income above 35% guideline.', 'Declared income exceeds bank-verified figure.', 'Affordability threshold breached for the primary applicant.']
const OBS_AFFORD_CR2 = ['Rent-to-income at 24% — within preferred threshold.', 'Joint income well-evidenced via bank statements.', 'Debt servicing estimated from income-band norms.']
const OBS_AFFORD_LC  = ['Rent-to-income at 42% — above preferred threshold.', 'Debt servicing unconfirmed for one applicant.', 'Income evidence Tier 3 for lowest-income applicant.']
const OBS_AFFORD_AS  = ['Rent-to-income at 47% — well above preferred threshold.', 'Material income discrepancy recorded for one applicant.', 'Debt servicing at 29% — adverse combined burden.']
const OBS_AFFORD_BL  = ['Rent-to-income at 28% — within preferred threshold.', 'Score blocked by critical SAFPS flag.', 'Affordability metrics otherwise within range.']
const OBS_AFFORD_LDP = ['Insufficient income evidence for assessment.', 'No bank-verified figure available.', 'Dimension not scored.']

const OBS_STAB_SP  = ['Income-weighted tenure 2.9 years.', 'One rental reference verified in Pleks network.', 'No adverse stability signals.']
const OBS_STAB_VS  = ['Income-weighted tenure 4.9 years — strong stability signal.', 'Two rental references verified in Pleks network.', 'No adverse employment-pattern signals.']
const OBS_STAB_CR  = ['Income-weighted tenure 1.7 years — below preferred threshold.', 'No rental references verified.', 'Employment tenure below preferred threshold for two applicants.']
const OBS_STAB_LC  = ['Income-weighted tenure 2.1 years.', 'One applicant work permit within lease term.', 'No prior Pleks network tenancy for any applicant.']
const OBS_STAB_AS  = ['Income-weighted tenure 1.1 years — low stability signal.', 'No rental references verified.', 'Adverse income-pattern signal for primary applicant.']
const OBS_STAB_BL  = ['Income-weighted tenure 2.4 years.', 'No adverse stability signals beyond SAFPS.', 'Employment patterns consistent across applicants.']
const OBS_STAB_LDP = ['Insufficient employment evidence for assessment.', 'No Pleks network history available.', 'Dimension not scored.']

const OBS_CRED_SP  = ['Coverage-weighted median across two to three bureaus.', 'No adverse listings detected.', 'Scores within stable-band range for all SA applicants.']
const OBS_CRED_VS  = ['Coverage-weighted median across three bureaus per SA applicant.', 'No adverse listings; scores aligned within 30-point spread.', 'No outlier readings detected.']
const OBS_CRED_CR  = ['Coverage partial — one bureau non-responding for primary applicant.', 'Score median within cautious-review range.', 'No active judgments; bureau thin flag applied.']
const OBS_CRED_LC  = ['Active judgment recorded within last 24 months for one applicant.', 'Coverage limited to single bureau for one applicant.', 'Capping flag applied — band ceiling limited_confidence.']
const OBS_CRED_AS  = ['Debt review active for primary applicant.', 'Coverage partial; adverse listings detected.', 'Capping flag applied — band ceiling cautious_review.']
const OBS_CRED_BL  = ['SAFPS fraud-listing match — blocked outcome.', 'Three bureaus responded; match confirmed.', 'Critical flag overrides composite score.']
const OBS_CRED_LDP = ['Insufficient bureau coverage for assessment.', 'No responding bureaus across applicant group.', 'Dimension not scored.']

const OBS_VERIF_SP  = ['Majority of checks passed across applicant group.', 'Identity match confirmed for all applicants.', 'No manual overrides pending.']
const OBS_VERIF_VS  = ['All checks passed across both applicants.', 'Identity match foundational — DHA-NPR confirmed.', 'No overrides required.']
const OBS_VERIF_CR  = ['Most checks passed; one applicant partial.', 'Salary reconciliation partial for one applicant.', 'No audit overrides applied.']
const OBS_VERIF_LC  = ['Majority of checks passed; one applicant partial.', 'Document consistency check partial for lowest-income applicant.', 'No manual overrides.']
const OBS_VERIF_AS  = ['Three of five checks passed per applicant on average.', 'Salary reconciliation failed for primary applicant.', 'Income evidence below Tier 2 for two applicants.']
const OBS_VERIF_BL  = ['Most checks passed; primary applicant identity flagged.', 'Identity match completed but SAFPS match recorded.', 'No further overrides possible post-block.']
const OBS_VERIF_LDP = ['Insufficient verification evidence for assessment.', 'Checks attempted but coverage below threshold.', 'Dimension not scored.']

const NAR_VS_MULTI: NarrativeResponse = {
  observedStrengths: [
    'Both applicants hold verified tenancy records in the Pleks network.',
    'Joint income verified across three bureaus per SA applicant.',
    'Employment tenure exceeds four years for primary applicant.',
    'Rent at 23% of verified joint income.',
  ],
  observedConcerns: [],
  limitedVisibility: [],
  affordabilityEvidenceLine: 'Rent 23% of verified joint income; debt servicing 8%.',
  stabilityEvidenceLine:     'Income-weighted tenure 4.9 years; two rental references verified.',
  creditEvidenceLine:        'Coverage-weighted median across three bureaus; scores aligned.',
  verificationEvidenceLine:  'Ten of ten checks passed across both applicants.',
  affordabilityObservations: OBS_AFFORD_VS,
  stabilityObservations:     OBS_STAB_VS,
  creditObservations:        OBS_CRED_VS,
  verificationObservations:  OBS_VERIF_VS,
  ldpSummary: null, isTemplated: false, failureReason: null,
}

const NAR_SP_MULTI: NarrativeResponse = {
  observedStrengths: [
    'Identity match confirmed for all applicants.',
    'Bureau coverage across two to three bureaus per SA applicant.',
    'Joint income well above minimum affordability threshold.',
  ],
  observedConcerns: [
    'Bureau coverage partial for one applicant.',
  ],
  limitedVisibility: [
    'No Pleks network history for any applicant.',
  ],
  affordabilityEvidenceLine: 'Rent 26% of verified joint income; debt servicing 11%.',
  stabilityEvidenceLine:     'Income-weighted tenure 2.9 years; one rental reference verified.',
  creditEvidenceLine:        'Coverage-weighted median across two to three bureaus per SA applicant.',
  verificationEvidenceLine:  'Majority of checks passed across applicant group.',
  affordabilityObservations: OBS_AFFORD_SP,
  stabilityObservations:     OBS_STAB_SP,
  creditObservations:        OBS_CRED_SP,
  verificationObservations:  OBS_VERIF_SP,
  ldpSummary: null, isTemplated: false, failureReason: null,
}

const NAR_CR_MULTI: NarrativeResponse = {
  observedStrengths: [
    'Identity match confirmed for all applicants.',
    'Bank statement deposit patterns match employer names.',
  ],
  observedConcerns: [
    'Rent exceeds 35% guideline against joint verified income.',
    'One applicant with bureau coverage limited to a single bureau.',
  ],
  limitedVisibility: [
    'No Pleks network history.',
    'One applicant has no SA bureau coverage (foreign national).',
  ],
  affordabilityEvidenceLine: 'Rent 36% of verified joint income; debt servicing 18%.',
  stabilityEvidenceLine:     'Income-weighted tenure 1.7 years; no rental references verified.',
  creditEvidenceLine:        'Coverage-weighted median for SA applicants; foreign national excluded.',
  verificationEvidenceLine:  'Most verification checks passed; one applicant partial.',
  affordabilityObservations: OBS_AFFORD_CR,
  stabilityObservations:     OBS_STAB_CR,
  creditObservations:        OBS_CRED_CR,
  verificationObservations:  OBS_VERIF_CR,
  ldpSummary: null, isTemplated: false, failureReason: null,
}

const NAR_CR_FOREIGN: NarrativeResponse = {
  observedStrengths: [
    'Identity match confirmed for all applicants via DHA-NPR.',
    'Joint income well-evidenced via bank statements.',
    'Employment tenure recorded for all applicants.',
  ],
  observedConcerns: [
    'Two applicants have work permits expiring within the proposed lease term.',
    'No SA bureau coverage available for any applicant.',
  ],
  limitedVisibility: [
    'Credit Behaviour dimension not assessed — no SA bureau coverage for any applicant.',
  ],
  affordabilityEvidenceLine: 'Rent 24% of verified joint income.',
  stabilityEvidenceLine:     'Income-weighted tenure 2.3 years.',
  creditEvidenceLine:        null,
  verificationEvidenceLine:  'Most verification checks passed across applicant group.',
  affordabilityObservations: OBS_AFFORD_CR2,
  stabilityObservations:     OBS_STAB_CR,
  creditObservations:        null,
  verificationObservations:  OBS_VERIF_CR,
  ldpSummary: null, isTemplated: false, failureReason: null,
}

const NAR_LC_MULTI: NarrativeResponse = {
  observedStrengths: [
    'Primary applicant trusted by Pleks Network.',
    'Identity match confirmed for all applicants.',
  ],
  observedConcerns: [
    'Active judgment recorded for one applicant within last 24 months.',
    'Rent at 42% of verified joint income.',
    'Work permit expiry falls within proposed lease term (one applicant).',
  ],
  limitedVisibility: [
    'No bureau coverage for foreign-national applicant.',
  ],
  affordabilityEvidenceLine: 'Rent 42% of verified joint income; debt servicing 24%.',
  stabilityEvidenceLine:     'Income-weighted tenure 2.1 years.',
  creditEvidenceLine:        'Active judgment recorded; coverage partial across SA applicants.',
  verificationEvidenceLine:  'Majority of checks passed; one applicant partial.',
  affordabilityObservations: OBS_AFFORD_LC,
  stabilityObservations:     OBS_STAB_LC,
  creditObservations:        OBS_CRED_LC,
  verificationObservations:  OBS_VERIF_LC,
  ldpSummary: null, isTemplated: false, failureReason: null,
}

const NAR_AS_MULTI: NarrativeResponse = {
  observedStrengths: [],
  observedConcerns: [
    'Debt review active for primary applicant.',
    'Material income discrepancy: 48% variance for one applicant.',
    'Rent at 47% of verified joint income.',
    'Work permit expiry within proposed lease term (one applicant).',
  ],
  limitedVisibility: [
    'No bureau coverage for two foreign-national applicants.',
    'No Pleks network history.',
  ],
  affordabilityEvidenceLine: 'Rent 47% of verified joint income; debt servicing 29%.',
  stabilityEvidenceLine:     'Income-weighted tenure 1.1 years.',
  creditEvidenceLine:        'Debt review active; coverage partial for SA applicants.',
  verificationEvidenceLine:  'Three of five checks passed per applicant on average.',
  affordabilityObservations: OBS_AFFORD_AS,
  stabilityObservations:     OBS_STAB_AS,
  creditObservations:        OBS_CRED_AS,
  verificationObservations:  OBS_VERIF_AS,
  ldpSummary: null, isTemplated: false, failureReason: null,
}

const NAR_BL_MULTI: NarrativeResponse = {
  observedStrengths: [],
  observedConcerns: [
    'SAFPS fraud-listing match returned for primary applicant identity number.',
    'Assessment blocked — composite score not issued.',
  ],
  limitedVisibility: [],
  affordabilityEvidenceLine: 'Rent 28% of verified joint income.',
  stabilityEvidenceLine:     'Income-weighted tenure 2.4 years.',
  creditEvidenceLine:        'Three bureaus responded; SAFPS match recorded for primary applicant.',
  verificationEvidenceLine:  'Most checks passed; primary applicant identity flagged.',
  affordabilityObservations: OBS_AFFORD_BL,
  stabilityObservations:     OBS_STAB_BL,
  creditObservations:        OBS_CRED_BL,
  verificationObservations:  OBS_VERIF_BL,
  ldpSummary: null, isTemplated: false, failureReason: null,
}

const NAR_LDP_MULTI: NarrativeResponse = {
  observedStrengths: [],
  observedConcerns: [],
  limitedVisibility: [],
  affordabilityEvidenceLine: '',
  stabilityEvidenceLine:     '',
  creditEvidenceLine:        null,
  verificationEvidenceLine:  '',
  affordabilityObservations: OBS_AFFORD_LDP,
  stabilityObservations:     OBS_STAB_LDP,
  creditObservations:        OBS_CRED_LDP,
  verificationObservations:  OBS_VERIF_LDP,
  ldpSummary: 'Engine did not produce a composite score — insufficient signal coverage across the applicant group.',
  isTemplated: false, failureReason: null,
}

const NAR_LDP_FOREIGN: NarrativeResponse = {
  observedStrengths: [],
  observedConcerns: [],
  limitedVisibility: [],
  affordabilityEvidenceLine: '',
  stabilityEvidenceLine:     '',
  creditEvidenceLine:        null,
  verificationEvidenceLine:  '',
  affordabilityObservations: OBS_AFFORD_LDP,
  stabilityObservations:     OBS_STAB_LDP,
  creditObservations:        null,
  verificationObservations:  OBS_VERIF_LDP,
  ldpSummary: 'Engine did not produce a composite score — insufficient verified signal sources for all-foreign-national applicant group. Eyebrow suppressed: LDP takes precedence over evidentiary-class framing.',
  isTemplated: false, failureReason: null,
}

// ─── Material flag builders ────────────────────────────────────────────────────

function flag(
  flagId: string,
  cls: 'critical' | 'capping' | 'trust',
  description: string,
  capCeiling: string | null = null,
  applicantLabel: string | null = null,
): MaterialFlag {
  return {
    flag: flagId,
    class: cls,
    capApplied: capCeiling !== null,
    capCeiling,
    applicantId: null,
    applicantLabel,
    description,
    source: 'density_pass_fixture',
    observedAt: '2026-05-26T08:00:00Z',
  } as MaterialFlag
}

const F_TRUSTED_A  = flag('pleks_network_trusted',       'trust',    'Trusted by Pleks Network (Applicant A)', null, 'Applicant A')
const F_TRUSTED_B  = flag('pleks_network_trusted',       'trust',    'Trusted by Pleks Network (Applicant B)', null, 'Applicant B')
const F_BUREAU     = flag('bureau_coverage_partial',      'capping',  'Bureau coverage partial', 'stable_profile')
const F_JUDGMENT   = flag('active_judgment',              'capping',  'Active judgment recorded in last 24 months', 'limited_confidence', 'Applicant C')
const F_PERMIT_A   = flag('permit_expires_within_lease',  'capping',  'Work permit expires within proposed lease term', 'stable_profile', 'Applicant A')
const F_PERMIT_B   = flag('permit_expires_within_lease',  'capping',  'Work permit expires within proposed lease term', 'stable_profile', 'Applicant B')
const F_PERMIT_D   = flag('permit_expires_within_lease',  'capping',  'Work permit expires within proposed lease term', 'stable_profile', 'Applicant D')
const F_PERMIT_F   = flag('permit_expires_within_lease',  'capping',  'Work permit expires within proposed lease term', 'stable_profile', 'Applicant F')
const F_DEBT_REV   = flag('debt_review_active',           'capping',  'Debt review active', 'cautious_review', 'Applicant A')
const F_INCOME_D   = flag('material_income_discrepancy',  'capping',  'Material income discrepancy — 48% variance', 'cautious_review', 'Applicant C')
const F_SAFPS      = flag('safps_fraud_match',            'critical', 'SAFPS fraud-listing match', null, 'Applicant A')

// ─── Applicant builders ────────────────────────────────────────────────────────

function sa(overrides: Partial<FitScoreApplicantEntry>): FitScoreApplicantEntry {
  return {
    label:                  'A',
    fullName:               'Jane Mokoena',
    nationalityStatus:      'SA Citizen',
    idNumberMasked:         '8807*****091',
    sex:                    'F',
    ageYears:               37,
    employment:             { employerName: 'Acme Capital (Pty) Ltd', jobTitle: 'Senior Analyst', tenureDisplay: '3y 4mo' },
    verifiedIncomeCents:    3500000,
    incomeSharePct:         100,
    verificationPassCount:  5,
    verificationTotal:      5,
    respondingBureaus:      ['TransUnion', 'VeriCred', 'Sigma'],
    pleksNetworkStatus:     'none',
    pleksNetworkTenancyCount: 0,
    isForeignNational:      false,
    ...overrides,
  }
}

function foreign(overrides: Partial<FitScoreApplicantEntry>): FitScoreApplicantEntry {
  return {
    label:                  'A',
    fullName:               'Amara Okonkwo',
    nationalityStatus:      'Foreign National (Work Permit, expires 2027-08-15)',
    idNumberMasked:         'M*****3',
    sex:                    null,
    ageYears:               null,
    employment:             { employerName: 'Global Solutions Ltd', jobTitle: 'Operations Director', tenureDisplay: '2y 6mo' },
    verifiedIncomeCents:    5200000,
    incomeSharePct:         100,
    verificationPassCount:  5,
    verificationTotal:      5,
    respondingBureaus:      [],
    pleksNetworkStatus:     'none',
    pleksNetworkTenancyCount: 0,
    isForeignNational:      true,
    ...overrides,
  }
}

// ─── Dimension stats defaults ──────────────────────────────────────────────────

function dims(rentPct: number, opts: { allForeign?: boolean; ldp?: boolean } = {}) {
  return {
    affordability: { rentToIncomePct: rentPct, windowMonths: 6 },
    stability:     { currentTenureDisplay: '3y 4mo', employersIn7Years: 1 },
    credit: {
      bureauCoverageDisplay: opts.allForeign ? 'n/a' : '3 / 3',
      divergencePoints:      opts.ldp ? null : null,
    },
    verification: { checksPassedDisplay: '5 / 5', manualOverridesPending: 0, auditEntriesCount: 5 },
  }
}

// ─── Base fixture builder ──────────────────────────────────────────────────────

function base(overrides: Partial<FitScoreReportData> = {}): FitScoreReportData {
  return {
    applicationRef:       'dp-fixture',
    unitLabel:            '3-bedroom townhouse, Sandton, Johannesburg',
    generatedAt:          '2026-05-26T08:00:00Z',
    submittedAt:          '2026-05-25T14:00:00Z',
    primaryApplicantName: 'Jane Mokoena',
    coApplicantCount:     1,
    applicants:           [],
    leaseIntent:          { termMonths: 12, monthlyRentCents: 1950000, depositMultiplier: 2 },
    band:                 'stable_profile',
    score:                76,
    confidenceIndex:      'medium',
    verificationIntegrity: 'medium',
    dimensionalScores: {
      affordability:            74,
      stability:                72,
      creditBehaviour:          70,
      verificationIntegrity:    80,
      affordability_preferred_threshold:           50,
      stability_preferred_threshold:               60,
      creditBehaviour_preferred_threshold:         50,
      verificationIntegrity_preferred_threshold:   70,
    },
    materialFlags:          [],
    isLdp:                  false,
    isAllForeignNational:   false,
    narrative:              NAR_SP_MULTI,
    engineVersion:          'fitscore.v1.0.1',
    narrativeVersion:       'narr.v1.0',
    interpretationVersion:  'interpretation.v1.0',
    synthesisVersion:       'synthesis.v1.0',
    inputsHash:             'a1b2c3d4e5f67890',
    orgName:                'Density Pass Agency',
    orgFfcNumber:           'FFC-20220001',
    dimensions:             dims(26),
    ...overrides,
  }
}

// ─── 15 fixture definitions ────────────────────────────────────────────────────
// Doctrine-claim comment on each fixture tracks what doctrinal claim it verifies.

interface Fixture {
  id: string
  // one-line doctrine claim this render verifies
  doctrineClaim: string
  data: FitScoreReportData
}

const FIXTURES: Fixture[] = [

  // #1 — N=2 interpretive, all-SA, stable_profile
  // Doctrine: ApplicantDetail dispatches to ApplicantDetailInterpretive (full four-zone card per applicant)
  {
    id: '01-interpretive-sa-stable',
    doctrineClaim: 'N=2 → interpretive mode. ApplicantDetail renders full four-zone per-applicant card. 2x2 DimensionCard. No eyebrow.',
    data: base({
      applicationRef: 'dp-01',
      band: 'stable_profile', score: 77,
      confidenceIndex: 'medium', verificationIntegrity: 'high',
      dimensionalScores: { affordability: 76, stability: 74, creditBehaviour: 78, verificationIntegrity: 82,
        affordability_preferred_threshold: 50, stability_preferred_threshold: 60,
        creditBehaviour_preferred_threshold: 50, verificationIntegrity_preferred_threshold: 70 },
      materialFlags: [],
      narrative: NAR_SP_MULTI,
      dimensions: dims(26),
      applicants: [
        sa({ label: 'A', fullName: 'Jane Mokoena',  verifiedIncomeCents: 4200000, incomeSharePct: 55,
             pleksNetworkStatus: 'trusted', pleksNetworkTenancyCount: 1,
             employment: { employerName: 'Acme Capital (Pty) Ltd', jobTitle: 'Senior Analyst', tenureDisplay: '4y 2mo' } }),
        sa({ label: 'B', fullName: 'Sipho Dlamini', verifiedIncomeCents: 3400000, incomeSharePct: 45,
             idNumberMasked: '9201*****082', sex: 'M', ageYears: 33,
             respondingBureaus: ['TransUnion', 'VeriCred'],
             employment: { employerName: 'Metro Bank Ltd', jobTitle: 'Financial Advisor', tenureDisplay: '2y 8mo' } }),
      ],
    }),
  },

  // #2 — N=2 interpretive, all-foreign, cautious_review
  // Doctrine: isAllForeignNational=true && !isLdp → MethodologyEyebrow visible; 3-card DimensionCard (no credit); interpretive mode
  {
    id: '02-interpretive-foreign-cautious',
    doctrineClaim: 'N=2 all-foreign → interpretive mode. MethodologyEyebrow visible. 3-card DimensionCard; creditBehaviour null.',
    data: base({
      applicationRef: 'dp-02',
      band: 'cautious_review', score: 61,
      confidenceIndex: 'medium', verificationIntegrity: 'medium',
      isAllForeignNational: true,
      dimensionalScores: { affordability: 66, stability: 60, creditBehaviour: null, verificationIntegrity: 72,
        affordability_preferred_threshold: 50, stability_preferred_threshold: 60,
        creditBehaviour_preferred_threshold: null, verificationIntegrity_preferred_threshold: 70 },
      materialFlags: [F_PERMIT_A, F_PERMIT_B],
      narrative: NAR_CR_FOREIGN,
      dimensions: dims(24, { allForeign: true }),
      applicants: [
        foreign({ label: 'A', fullName: 'Amara Okonkwo', verifiedIncomeCents: 5200000, incomeSharePct: 52,
                  nationalityStatus: 'Foreign National (Work Permit, expires 2027-08-15)',
                  employment: { employerName: 'Global Solutions Ltd', jobTitle: 'Operations Director', tenureDisplay: '2y 6mo' } }),
        foreign({ label: 'B', fullName: 'Chen Wei', verifiedIncomeCents: 4800000, incomeSharePct: 48,
                  nationalityStatus: 'Foreign National (Work Permit, expires 2026-09-30)',
                  idNumberMasked: 'E*****7',
                  employment: { employerName: 'Sinotech SA (Pty) Ltd', jobTitle: 'Project Manager', tenureDisplay: '1y 4mo' },
                  verificationPassCount: 4 }),
      ],
    }),
  },

  // #3 — N=3 summary, all-SA, stable_profile
  // Doctrine: N=3 → summary mode. Narrow identity rail; household-first three-column body. 2x2 DimensionCard. No eyebrow.
  {
    id: '03-summary-sa-stable',
    doctrineClaim: 'N=3 → summary mode. Narrow identity rail visually subordinated. Three-column body per card. 2x2 DimensionCard.',
    data: base({
      applicationRef: 'dp-03',
      coApplicantCount: 2,
      band: 'stable_profile', score: 75,
      confidenceIndex: 'medium', verificationIntegrity: 'medium',
      materialFlags: [],
      narrative: NAR_SP_MULTI,
      dimensions: dims(27),
      applicants: [
        sa({ label: 'A', fullName: 'Jane Mokoena',    verifiedIncomeCents: 3500000, incomeSharePct: 47,
             pleksNetworkStatus: 'none' }),
        sa({ label: 'B', fullName: 'Sipho Dlamini',   verifiedIncomeCents: 2500000, incomeSharePct: 34,
             idNumberMasked: '9201*****082', sex: 'M', ageYears: 33,
             respondingBureaus: ['TransUnion', 'VeriCred'],
             employment: { employerName: 'Metro Bank Ltd', jobTitle: 'Financial Advisor', tenureDisplay: '2y 1mo' } }),
        sa({ label: 'C', fullName: 'Nomsa Khumalo',   verifiedIncomeCents: 1500000, incomeSharePct: 20,
             idNumberMasked: '9407*****034', sex: 'F', ageYears: 31,
             respondingBureaus: ['TransUnion'],
             verificationPassCount: 4,
             employment: { employerName: 'City Works Dept', jobTitle: 'Administrator', tenureDisplay: '1y 6mo' } }),
      ],
    }),
  },

  // #4 — N=3 summary, mixed, cautious_review
  // Doctrine: N=3 summary mode, mixed lease. 2x2 DimensionCard carries reduced-coverage note on Credit card. No eyebrow.
  {
    id: '04-summary-mixed-cautious',
    doctrineClaim: 'N=3 summary, mixed lease. 2x2 DimensionCard with isMixed reduced-coverage note on Credit card. No eyebrow.',
    data: base({
      applicationRef: 'dp-04',
      coApplicantCount: 2,
      band: 'cautious_review', score: 59,
      confidenceIndex: 'medium', verificationIntegrity: 'medium',
      isAllForeignNational: false,
      dimensionalScores: { affordability: 55, stability: 58, creditBehaviour: 56, verificationIntegrity: 70,
        affordability_preferred_threshold: 50, stability_preferred_threshold: 60,
        creditBehaviour_preferred_threshold: 50, verificationIntegrity_preferred_threshold: 70 },
      materialFlags: [F_PERMIT_A],
      narrative: NAR_CR_MULTI,
      dimensions: dims(38),
      applicants: [
        sa({ label: 'A', fullName: 'Jane Mokoena',    verifiedIncomeCents: 3000000, incomeSharePct: 54,
             respondingBureaus: ['TransUnion', 'VeriCred'] }),
        sa({ label: 'B', fullName: 'Sipho Dlamini',   verifiedIncomeCents: 1800000, incomeSharePct: 32,
             idNumberMasked: '9201*****082', sex: 'M', ageYears: 33,
             respondingBureaus: ['TransUnion'], verificationPassCount: 4,
             employment: { employerName: 'Metro Bank Ltd', jobTitle: 'Teller', tenureDisplay: '1y 3mo' } }),
        foreign({ label: 'C', fullName: 'Amara Okonkwo', verifiedIncomeCents: 800000, incomeSharePct: 14,
                  employment: { employerName: 'Global Solutions Ltd', jobTitle: 'Associate', tenureDisplay: '0y 8mo' } }),
      ],
    }),
  },

  // #5 — N=4 comparative, all-SA, cautious_review
  // Doctrine: N=4 → comparative mode. 2x2 card grid; horizontal-across-applicants layout. 2x2 DimensionCard. No eyebrow.
  {
    id: '05-comparative-sa-cautious',
    doctrineClaim: 'N=4 → comparative mode. 2x2 card grid layout. Horizontal-across-applicants reading posture. 2x2 DimensionCard.',
    data: base({
      applicationRef: 'dp-05',
      coApplicantCount: 3,
      band: 'cautious_review', score: 58,
      dimensionalScores: { affordability: 54, stability: 56, creditBehaviour: 58, verificationIntegrity: 68,
        affordability_preferred_threshold: 50, stability_preferred_threshold: 60,
        creditBehaviour_preferred_threshold: 50, verificationIntegrity_preferred_threshold: 70 },
      materialFlags: [F_BUREAU],
      narrative: NAR_CR_MULTI,
      dimensions: dims(37),
      applicants: [
        sa({ label: 'A', fullName: 'Jane Mokoena',    verifiedIncomeCents: 3000000, incomeSharePct: 38 }),
        sa({ label: 'B', fullName: 'Sipho Dlamini',   verifiedIncomeCents: 2200000, incomeSharePct: 28,
             idNumberMasked: '9201*****082', sex: 'M', ageYears: 33,
             respondingBureaus: ['TransUnion', 'VeriCred'],
             employment: { employerName: 'Metro Bank Ltd', jobTitle: 'Advisor', tenureDisplay: '2y 3mo' } }),
        sa({ label: 'C', fullName: 'Nomsa Khumalo',   verifiedIncomeCents: 1700000, incomeSharePct: 22,
             idNumberMasked: '9407*****034', sex: 'F', ageYears: 31,
             respondingBureaus: ['TransUnion', 'VeriCred'],
             employment: { employerName: 'City Works Dept', jobTitle: 'Administrator', tenureDisplay: '1y 9mo' } }),
        sa({ label: 'D', fullName: 'David Nkosi',     verifiedIncomeCents: 900000, incomeSharePct: 12,
             idNumberMasked: '9005*****017', sex: 'M', ageYears: 35,
             respondingBureaus: ['TransUnion'], verificationPassCount: 3,
             employment: { employerName: 'Retail Co', jobTitle: 'Supervisor', tenureDisplay: '0y 11mo' } }),
      ],
    }),
  },

  // #6 — N=4 comparative, mixed, limited_confidence — trust+capping interaction
  // Doctrine: N=4 comparative; mixed lease; trust flag on A, capping flags on C (judgment) and D (permit); limited_confidence band
  {
    id: '06-comparative-mixed-limited',
    doctrineClaim: 'N=4 comparative, mixed; trust (A) + capping: judgment (C) + permit expiry (D). Limited confidence band. Credit note visible.',
    data: base({
      applicationRef: 'dp-06',
      coApplicantCount: 3,
      band: 'limited_confidence', score: 47,
      confidenceIndex: 'low', verificationIntegrity: 'medium',
      isAllForeignNational: false,
      dimensionalScores: { affordability: 40, stability: 45, creditBehaviour: 48, verificationIntegrity: 62,
        affordability_preferred_threshold: 50, stability_preferred_threshold: 60,
        creditBehaviour_preferred_threshold: 50, verificationIntegrity_preferred_threshold: 70 },
      materialFlags: [F_TRUSTED_A, F_JUDGMENT, F_PERMIT_D],
      narrative: NAR_LC_MULTI,
      dimensions: dims(42),
      applicants: [
        sa({ label: 'A', fullName: 'Jane Mokoena',    verifiedIncomeCents: 3200000, incomeSharePct: 42,
             pleksNetworkStatus: 'trusted', pleksNetworkTenancyCount: 1 }),
        sa({ label: 'B', fullName: 'Sipho Dlamini',   verifiedIncomeCents: 1800000, incomeSharePct: 24,
             idNumberMasked: '9201*****082', sex: 'M', ageYears: 33,
             respondingBureaus: ['TransUnion', 'VeriCred'], verificationPassCount: 4,
             employment: { employerName: 'Metro Bank Ltd', jobTitle: 'Advisor', tenureDisplay: '1y 6mo' } }),
        sa({ label: 'C', fullName: 'Nomsa Khumalo',   verifiedIncomeCents: 1400000, incomeSharePct: 18,
             idNumberMasked: '9407*****034', sex: 'F', ageYears: 31,
             respondingBureaus: ['TransUnion'], verificationPassCount: 3,
             employment: { employerName: 'City Works Dept', jobTitle: 'Administrator', tenureDisplay: '2y 2mo' } }),
        foreign({ label: 'D', fullName: 'Amara Okonkwo', verifiedIncomeCents: 1200000, incomeSharePct: 16 }),
      ],
    }),
  },

  // #7 — N=5 operational, all-SA, stable_profile
  // Doctrine: N=5 → operational mode. Row-per-applicant table; throughput-first scanning. 2x2 DimensionCard. No eyebrow.
  {
    id: '07-operational-sa-stable',
    doctrineClaim: 'N=5 → operational mode. Row-per-applicant table layout. 2x2 DimensionCard. No eyebrow.',
    data: base({
      applicationRef: 'dp-07',
      coApplicantCount: 4,
      band: 'stable_profile', score: 76,
      confidenceIndex: 'medium', verificationIntegrity: 'high',
      materialFlags: [F_TRUSTED_A],
      narrative: NAR_SP_MULTI,
      dimensions: dims(24),
      applicants: [
        sa({ label: 'A', fullName: 'Jane Mokoena',    verifiedIncomeCents: 3500000, incomeSharePct: 29,
             pleksNetworkStatus: 'trusted', pleksNetworkTenancyCount: 2 }),
        sa({ label: 'B', fullName: 'Sipho Dlamini',   verifiedIncomeCents: 2800000, incomeSharePct: 23,
             idNumberMasked: '9201*****082', sex: 'M', ageYears: 33,
             employment: { employerName: 'Metro Bank Ltd', jobTitle: 'Advisor', tenureDisplay: '3y 1mo' } }),
        sa({ label: 'C', fullName: 'Nomsa Khumalo',   verifiedIncomeCents: 2500000, incomeSharePct: 21,
             idNumberMasked: '9407*****034', sex: 'F', ageYears: 31,
             respondingBureaus: ['TransUnion', 'VeriCred'],
             employment: { employerName: 'City Works Dept', jobTitle: 'Administrator', tenureDisplay: '2y 8mo' } }),
        sa({ label: 'D', fullName: 'David Nkosi',     verifiedIncomeCents: 2100000, incomeSharePct: 17,
             idNumberMasked: '9005*****017', sex: 'M', ageYears: 35,
             respondingBureaus: ['TransUnion', 'VeriCred'], verificationPassCount: 4,
             employment: { employerName: 'Retail Co', jobTitle: 'Supervisor', tenureDisplay: '1y 5mo' } }),
        sa({ label: 'E', fullName: 'Thabo Motsepe',   verifiedIncomeCents: 1200000, incomeSharePct: 10,
             idNumberMasked: '8912*****055', sex: 'M', ageYears: 36,
             respondingBureaus: ['TransUnion'], verificationPassCount: 4,
             employment: { employerName: 'Freeware IT', jobTitle: 'Technician', tenureDisplay: '0y 9mo' } }),
      ],
    }),
  },

  // #8 — N=5 operational, mixed, cautious_review, capping
  // Doctrine: N=5 operational; mixed lease; bureau capping (C) + permit expiry capping (D); 2x2 DimCard with isMixed note.
  {
    id: '08-operational-mixed-cautious',
    doctrineClaim: 'N=5 operational, mixed; capping on C (bureau) and D (permit). 2x2 DimensionCard with mixed reduced-coverage note.',
    data: base({
      applicationRef: 'dp-08',
      coApplicantCount: 4,
      band: 'cautious_review', score: 57,
      isAllForeignNational: false,
      dimensionalScores: { affordability: 52, stability: 55, creditBehaviour: 58, verificationIntegrity: 66,
        affordability_preferred_threshold: 50, stability_preferred_threshold: 60,
        creditBehaviour_preferred_threshold: 50, verificationIntegrity_preferred_threshold: 70 },
      materialFlags: [F_BUREAU, F_PERMIT_D],
      narrative: NAR_CR_MULTI,
      dimensions: dims(34),
      applicants: [
        sa({ label: 'A', fullName: 'Jane Mokoena',    verifiedIncomeCents: 2800000, incomeSharePct: 31 }),
        sa({ label: 'B', fullName: 'Sipho Dlamini',   verifiedIncomeCents: 2200000, incomeSharePct: 24,
             idNumberMasked: '9201*****082', sex: 'M', ageYears: 33,
             respondingBureaus: ['TransUnion', 'VeriCred'] }),
        sa({ label: 'C', fullName: 'Nomsa Khumalo',   verifiedIncomeCents: 1800000, incomeSharePct: 20,
             idNumberMasked: '9407*****034', sex: 'F', ageYears: 31,
             respondingBureaus: ['TransUnion'], verificationPassCount: 4 }),
        foreign({ label: 'D', fullName: 'Amara Okonkwo', verifiedIncomeCents: 1600000, incomeSharePct: 18 }),
        foreign({ label: 'E', fullName: 'Chen Wei',       verifiedIncomeCents: 600000,  incomeSharePct: 7,
                  nationalityStatus: 'Foreign National (Work Permit, expires 2028-12-31)',
                  idNumberMasked: 'E*****7',
                  verificationPassCount: 4 }),
      ],
    }),
  },

  // #9 — N=8 operational, all-SA, cautious_review, heterogeneous signals
  // Doctrine: N=8 operational; heterogeneous income range, mixed network status, varying bureau coverage — all visible in row table.
  {
    id: '09-operational-sa-varied',
    doctrineClaim: 'N=8 operational, all-SA, heterogeneous. Row table scans across diverse income range, bureau count, and network status.',
    data: base({
      applicationRef: 'dp-09',
      coApplicantCount: 7,
      band: 'cautious_review', score: 56,
      dimensionalScores: { affordability: 54, stability: 52, creditBehaviour: 56, verificationIntegrity: 65,
        affordability_preferred_threshold: 50, stability_preferred_threshold: 60,
        creditBehaviour_preferred_threshold: 50, verificationIntegrity_preferred_threshold: 70 },
      materialFlags: [F_TRUSTED_A, F_BUREAU],
      narrative: NAR_CR_MULTI,
      dimensions: { ...dims(26), stability: { currentTenureDisplay: '2y 9mo', employersIn7Years: 2 } },
      applicants: [
        sa({ label: 'A', fullName: 'Jane Mokoena',    verifiedIncomeCents: 4500000, incomeSharePct: 33,
             pleksNetworkStatus: 'trusted', pleksNetworkTenancyCount: 3 }),
        sa({ label: 'B', fullName: 'Sipho Dlamini',   verifiedIncomeCents: 2400000, incomeSharePct: 18,
             idNumberMasked: '9201*****082', sex: 'M', ageYears: 33,
             respondingBureaus: ['TransUnion', 'VeriCred'] }),
        sa({ label: 'C', fullName: 'Nomsa Khumalo',   verifiedIncomeCents: 2100000, incomeSharePct: 15,
             idNumberMasked: '9407*****034', sex: 'F', ageYears: 31 }),
        sa({ label: 'D', fullName: 'David Nkosi',     verifiedIncomeCents: 1900000, incomeSharePct: 14,
             idNumberMasked: '9005*****017', sex: 'M', ageYears: 35,
             pleksNetworkStatus: 'adverse',
             respondingBureaus: ['TransUnion'], verificationPassCount: 4 }),
        sa({ label: 'E', fullName: 'Thabo Motsepe',   verifiedIncomeCents: 1100000, incomeSharePct: 8,
             idNumberMasked: '8912*****055', sex: 'M', ageYears: 36,
             respondingBureaus: [], verificationPassCount: 3 }),
        sa({ label: 'F', fullName: 'Lerato Sithole',  verifiedIncomeCents: 700000, incomeSharePct: 5,
             idNumberMasked: '9308*****021', sex: 'F', ageYears: 32,
             respondingBureaus: ['TransUnion', 'VeriCred'] }),
        sa({ label: 'G', fullName: 'Zanele Mahlangu', verifiedIncomeCents: 550000, incomeSharePct: 4,
             idNumberMasked: '9512*****043', sex: 'F', ageYears: 30,
             respondingBureaus: ['TransUnion'] }),
        sa({ label: 'H', fullName: 'Kagiso Molefe',   verifiedIncomeCents: 400000, incomeSharePct: 3,
             idNumberMasked: '9715*****019', sex: 'M', ageYears: 28,
             respondingBureaus: [], verificationPassCount: 3 }),
      ],
    }),
  },

  // #10 — N=8 operational, all-foreign, cautious_review
  // Doctrine: N=8 operational, all-foreign; MethodologyEyebrow visible; 3-card DimensionCard; row table for 8 applicants.
  {
    id: '10-operational-foreign-cautious',
    doctrineClaim: 'N=8 operational, all-foreign. MethodologyEyebrow visible. 3-card DimensionCard. Row table with 8 applicants.',
    data: base({
      applicationRef: 'dp-10',
      coApplicantCount: 7,
      band: 'cautious_review', score: 60,
      isAllForeignNational: true,
      dimensionalScores: { affordability: 64, stability: 60, creditBehaviour: null, verificationIntegrity: 70,
        affordability_preferred_threshold: 50, stability_preferred_threshold: 60,
        creditBehaviour_preferred_threshold: null, verificationIntegrity_preferred_threshold: 70 },
      materialFlags: [F_PERMIT_F],
      narrative: NAR_CR_FOREIGN,
      dimensions: dims(24, { allForeign: true }),
      applicants: [
        foreign({ label: 'A', fullName: 'Amara Okonkwo',   verifiedIncomeCents: 4200000, incomeSharePct: 29,
                  nationalityStatus: 'Foreign National (Work Permit, expires 2027-08-15)' }),
        foreign({ label: 'B', fullName: 'Chen Wei',         verifiedIncomeCents: 3100000, incomeSharePct: 22,
                  nationalityStatus: 'Foreign National (Work Permit, expires 2028-12-31)',
                  idNumberMasked: 'E*****7',
                  employment: { employerName: 'Sinotech SA (Pty) Ltd', jobTitle: 'Project Manager', tenureDisplay: '3y 2mo' } }),
        foreign({ label: 'C', fullName: 'Fatima Al-Rashid', verifiedIncomeCents: 2600000, incomeSharePct: 18,
                  nationalityStatus: 'Foreign National (Work Permit, expires 2027-03-15)',
                  idNumberMasked: 'F*****2',
                  employment: { employerName: 'Arabica Trading SA', jobTitle: 'Senior Buyer', tenureDisplay: '2y 1mo' } }),
        foreign({ label: 'D', fullName: 'Dmitri Volkov',    verifiedIncomeCents: 2000000, incomeSharePct: 14,
                  nationalityStatus: 'Foreign National (Work Permit, expires 2029-06-30)',
                  idNumberMasked: 'V*****9',
                  employment: { employerName: 'EasternBlock Mining', jobTitle: 'Engineer', tenureDisplay: '1y 8mo' } }),
        foreign({ label: 'E', fullName: 'Yuki Tanaka',      verifiedIncomeCents: 1400000, incomeSharePct: 10,
                  nationalityStatus: 'Foreign National (Work Permit, expires 2027-11-01)',
                  idNumberMasked: 'T*****4',
                  employment: { employerName: 'Nippon SA Ltd', jobTitle: 'Analyst', tenureDisplay: '1y 1mo' } }),
        foreign({ label: 'F', fullName: 'Maria Santos',     verifiedIncomeCents: 600000,  incomeSharePct: 4,
                  nationalityStatus: 'Foreign National (Work Permit, expires 2026-09-30)',
                  idNumberMasked: 'S*****1',
                  employment: { employerName: 'Iberia Trade', jobTitle: 'Assistant', tenureDisplay: '0y 4mo' } }),
        foreign({ label: 'G', fullName: 'Kwame Asante',     verifiedIncomeCents: 350000,  incomeSharePct: 2,
                  nationalityStatus: 'Foreign National (Work Permit, expires 2028-03-15)',
                  idNumberMasked: 'A*****6',
                  employment: { employerName: 'Continental Freight', jobTitle: 'Coordinator', tenureDisplay: '0y 7mo' } }),
        foreign({ label: 'H', fullName: 'Priya Nair',       verifiedIncomeCents: 100000,  incomeSharePct: 1,
                  nationalityStatus: 'Foreign National (Work Permit, expires 2027-07-15)',
                  idNumberMasked: 'N*****3',
                  employment: { employerName: 'SA Services Co', jobTitle: 'Junior Analyst', tenureDisplay: '0y 2mo' } }),
      ],
    }),
  },

  // #11 — N=2 interpretive, all-SA, verified_stability, trust flag on both applicants
  // Doctrine: N=2 interpretive, high-band render. Both applicants carry trust flag. 2x2 DimensionCard high scores.
  {
    id: '11-interpretive-sa-trust',
    doctrineClaim: 'N=2 interpretive, verified_stability. Trust flags on both applicants. 2x2 DimensionCard high scores.',
    data: base({
      applicationRef: 'dp-11',
      band: 'verified_stability', score: 91,
      confidenceIndex: 'high', verificationIntegrity: 'high',
      dimensionalScores: { affordability: 88, stability: 90, creditBehaviour: 94, verificationIntegrity: 96,
        affordability_preferred_threshold: 50, stability_preferred_threshold: 60,
        creditBehaviour_preferred_threshold: 50, verificationIntegrity_preferred_threshold: 70 },
      materialFlags: [F_TRUSTED_A, F_TRUSTED_B],
      narrative: NAR_VS_MULTI,
      dimensions: dims(23),
      applicants: [
        sa({ label: 'A', fullName: 'Jane Mokoena',    verifiedIncomeCents: 4500000, incomeSharePct: 56,
             pleksNetworkStatus: 'trusted', pleksNetworkTenancyCount: 3,
             employment: { employerName: 'Acme Capital (Pty) Ltd', jobTitle: 'Director', tenureDisplay: '5y 7mo' } }),
        sa({ label: 'B', fullName: 'Sipho Dlamini',   verifiedIncomeCents: 3500000, incomeSharePct: 44,
             idNumberMasked: '9201*****082', sex: 'M', ageYears: 33,
             pleksNetworkStatus: 'trusted', pleksNetworkTenancyCount: 1,
             employment: { employerName: 'Metro Bank Ltd', jobTitle: 'Senior Advisor', tenureDisplay: '4y 2mo' } }),
      ],
    }),
  },

  // #12 — N=4 comparative, all-SA, LDP
  // Doctrine: N=4 comparative; isLdp=true → DimensionCard renders notAssessed placeholders; MethodologyEyebrow SUPPRESSED.
  {
    id: '12-comparative-sa-ldp',
    doctrineClaim: 'N=4 comparative, LDP. DimensionCard renders notAssessed placeholders. MethodologyEyebrow suppressed (D-DSP-21).',
    data: base({
      applicationRef: 'dp-12',
      coApplicantCount: 3,
      band: 'limited_data_profile', score: null,
      confidenceIndex: 'insufficient', verificationIntegrity: 'limited',
      isLdp: true,
      dimensionalScores: { affordability: null, stability: null, creditBehaviour: null, verificationIntegrity: null,
        affordability_preferred_threshold: 50, stability_preferred_threshold: 60,
        creditBehaviour_preferred_threshold: 50, verificationIntegrity_preferred_threshold: 70 },
      materialFlags: [F_BUREAU],
      narrative: NAR_LDP_MULTI,
      dimensions: dims(30, { ldp: true }),
      applicants: [
        sa({ label: 'A', fullName: 'Jane Mokoena',    verifiedIncomeCents: 3000000, incomeSharePct: 38,
             respondingBureaus: [], verificationPassCount: 2 }),
        sa({ label: 'B', fullName: 'Sipho Dlamini',   verifiedIncomeCents: 2200000, incomeSharePct: 28,
             idNumberMasked: '9201*****082', sex: 'M', ageYears: 33,
             respondingBureaus: [], verificationPassCount: 1 }),
        sa({ label: 'C', fullName: 'Nomsa Khumalo',   verifiedIncomeCents: 1700000, incomeSharePct: 22,
             idNumberMasked: '9407*****034', sex: 'F', ageYears: 31,
             respondingBureaus: [], verificationPassCount: 2 }),
        sa({ label: 'D', fullName: 'David Nkosi',     verifiedIncomeCents: 900000, incomeSharePct: 12,
             idNumberMasked: '9005*****017', sex: 'M', ageYears: 35,
             respondingBureaus: [], verificationPassCount: 1 }),
      ],
    }),
  },

  // #13 — N=3 summary, all-SA, blocked (critical SAFPS flag on primary applicant)
  // Doctrine: N=3 summary mode; blocked band; SAFPS critical flag visible; score null.
  {
    id: '13-summary-sa-blocked',
    doctrineClaim: 'N=3 summary, blocked band. SAFPS critical flag on primary applicant. Score null. Summary layout still applies.',
    data: base({
      applicationRef: 'dp-13',
      coApplicantCount: 2,
      band: 'blocked', score: null,
      confidenceIndex: 'medium', verificationIntegrity: 'medium',
      dimensionalScores: { affordability: 66, stability: 60, creditBehaviour: 42, verificationIntegrity: 72,
        affordability_preferred_threshold: 50, stability_preferred_threshold: 60,
        creditBehaviour_preferred_threshold: 50, verificationIntegrity_preferred_threshold: 70 },
      materialFlags: [F_SAFPS],
      narrative: NAR_BL_MULTI,
      dimensions: dims(28),
      applicants: [
        sa({ label: 'A', fullName: 'Jane Mokoena',    verifiedIncomeCents: 3500000, incomeSharePct: 47 }),
        sa({ label: 'B', fullName: 'Sipho Dlamini',   verifiedIncomeCents: 2500000, incomeSharePct: 34,
             idNumberMasked: '9201*****082', sex: 'M', ageYears: 33,
             respondingBureaus: ['TransUnion', 'VeriCred'] }),
        sa({ label: 'C', fullName: 'Nomsa Khumalo',   verifiedIncomeCents: 1500000, incomeSharePct: 20,
             idNumberMasked: '9407*****034', sex: 'F', ageYears: 31,
             respondingBureaus: ['TransUnion'] }),
      ],
    }),
  },

  // #14 — N=5 operational, mixed, adverse_signals, capping
  // Doctrine: N=5 operational; adverse band; debt review (A) + income discrepancy (C) + permit expiry (D); 2x2 DimCard with mixed note.
  {
    id: '14-operational-mixed-adverse',
    doctrineClaim: 'N=5 operational, mixed, adverse_signals. Debt review (A), income discrepancy (C), permit expiry (D). Mixed note visible.',
    data: base({
      applicationRef: 'dp-14',
      coApplicantCount: 4,
      band: 'adverse_signals', score: 31,
      confidenceIndex: 'medium', verificationIntegrity: 'low',
      isAllForeignNational: false,
      dimensionalScores: { affordability: 28, stability: 30, creditBehaviour: 25, verificationIntegrity: 50,
        affordability_preferred_threshold: 50, stability_preferred_threshold: 60,
        creditBehaviour_preferred_threshold: 50, verificationIntegrity_preferred_threshold: 70 },
      materialFlags: [F_DEBT_REV, F_INCOME_D, F_PERMIT_D],
      narrative: NAR_AS_MULTI,
      dimensions: dims(47),
      applicants: [
        sa({ label: 'A', fullName: 'Jane Mokoena',    verifiedIncomeCents: 2800000, incomeSharePct: 31,
             respondingBureaus: ['TransUnion', 'VeriCred'], verificationPassCount: 3 }),
        sa({ label: 'B', fullName: 'Sipho Dlamini',   verifiedIncomeCents: 2200000, incomeSharePct: 24,
             idNumberMasked: '9201*****082', sex: 'M', ageYears: 33,
             respondingBureaus: ['TransUnion', 'VeriCred'], verificationPassCount: 4 }),
        sa({ label: 'C', fullName: 'Nomsa Khumalo',   verifiedIncomeCents: 1800000, incomeSharePct: 20,
             idNumberMasked: '9407*****034', sex: 'F', ageYears: 31,
             respondingBureaus: ['TransUnion', 'VeriCred'], verificationPassCount: 4 }),
        foreign({ label: 'D', fullName: 'Amara Okonkwo', verifiedIncomeCents: 1600000, incomeSharePct: 18,
                  verificationPassCount: 5 }),
        foreign({ label: 'E', fullName: 'Chen Wei',       verifiedIncomeCents: 600000,  incomeSharePct: 7,
                  nationalityStatus: 'Foreign National (Work Permit, expires 2028-12-31)',
                  idNumberMasked: 'E*****7', verificationPassCount: 5 }),
      ],
    }),
  },

  // #15 — N=2 interpretive, all-foreign, LDP — confirms D-DSP-21 (LDP precedence over evidentiary class)
  // Doctrine: isAllForeignNational=true AND isLdp=true → MethodologyEyebrow SUPPRESSED. Interpretive mode. notAssessed DimensionCard.
  {
    id: '15-interpretive-foreign-ldp',
    doctrineClaim: 'N=2 interpretive, all-foreign, LDP. MethodologyEyebrow suppressed (D-DSP-21: isLdp overrides isAllForeignNational). notAssessed DimensionCard.',
    data: base({
      applicationRef: 'dp-15',
      band: 'limited_data_profile', score: null,
      confidenceIndex: 'insufficient', verificationIntegrity: 'limited',
      isAllForeignNational: true,
      isLdp: true,
      dimensionalScores: { affordability: null, stability: null, creditBehaviour: null, verificationIntegrity: null,
        affordability_preferred_threshold: 50, stability_preferred_threshold: 60,
        creditBehaviour_preferred_threshold: null, verificationIntegrity_preferred_threshold: 70 },
      materialFlags: [],
      narrative: NAR_LDP_FOREIGN,
      dimensions: dims(28, { allForeign: true, ldp: true }),
      applicants: [
        foreign({ label: 'A', fullName: 'Amara Okonkwo', verifiedIncomeCents: 5000000, incomeSharePct: 55,
                  verificationPassCount: 3 }),
        foreign({ label: 'B', fullName: 'Chen Wei',       verifiedIncomeCents: 4100000, incomeSharePct: 45,
                  nationalityStatus: 'Foreign National (Work Permit, expires 2028-12-31)',
                  idNumberMasked: 'E*****7', verificationPassCount: 2 }),
      ],
    }),
  },
]

// ─── Lock 2 shared base fixture ────────────────────────────────────────────────
// 5-applicant all-SA mid-band stable_profile. Sliced to N=2/3/4/5 for cross-mode comparison.

const LOCK2_BASE_APPLICANTS: FitScoreApplicantEntry[] = [
  sa({ label: 'A', fullName: 'Jane Mokoena',    verifiedIncomeCents: 4200000, incomeSharePct: 35,
       pleksNetworkStatus: 'trusted', pleksNetworkTenancyCount: 1,
       employment: { employerName: 'Acme Capital (Pty) Ltd', jobTitle: 'Senior Analyst', tenureDisplay: '4y 2mo' } }),
  sa({ label: 'B', fullName: 'Sipho Dlamini',   verifiedIncomeCents: 3100000, incomeSharePct: 26,
       idNumberMasked: '9201*****082', sex: 'M', ageYears: 33,
       respondingBureaus: ['TransUnion', 'VeriCred', 'Sigma'],
       employment: { employerName: 'Metro Bank Ltd', jobTitle: 'Financial Advisor', tenureDisplay: '3y 1mo' } }),
  sa({ label: 'C', fullName: 'Nomsa Khumalo',   verifiedIncomeCents: 2800000, incomeSharePct: 23,
       idNumberMasked: '9407*****034', sex: 'F', ageYears: 31,
       respondingBureaus: ['TransUnion', 'VeriCred'],
       employment: { employerName: 'City Works Dept', jobTitle: 'Administrator', tenureDisplay: '2y 8mo' } }),
  sa({ label: 'D', fullName: 'David Nkosi',     verifiedIncomeCents: 1500000, incomeSharePct: 12,
       idNumberMasked: '9005*****017', sex: 'M', ageYears: 35,
       respondingBureaus: ['TransUnion', 'VeriCred'], verificationPassCount: 4,
       employment: { employerName: 'Retail Co', jobTitle: 'Supervisor', tenureDisplay: '1y 5mo' } }),
  sa({ label: 'E', fullName: 'Thabo Motsepe',   verifiedIncomeCents: 500000,  incomeSharePct: 4,
       idNumberMasked: '8912*****055', sex: 'M', ageYears: 36,
       respondingBureaus: ['TransUnion'], verificationPassCount: 4,
       employment: { employerName: 'Freeware IT', jobTitle: 'Technician', tenureDisplay: '0y 9mo' } }),
]

function lock2Data(n: 2 | 3 | 4 | 5): FitScoreReportData {
  const applicants = LOCK2_BASE_APPLICANTS.slice(0, n)
  return base({
    applicationRef: `lock2-N${n}`,
    coApplicantCount: n - 1,
    band: 'stable_profile', score: 76,
    confidenceIndex: 'medium', verificationIntegrity: 'high',
    dimensionalScores: { affordability: 74, stability: 72, creditBehaviour: 70, verificationIntegrity: 80,
      affordability_preferred_threshold: 50, stability_preferred_threshold: 60,
      creditBehaviour_preferred_threshold: 50, verificationIntegrity_preferred_threshold: 70 },
    materialFlags: [F_TRUSTED_A],
    narrative: NAR_SP_MULTI,
    dimensions: dims(26),
    applicants,
  })
}

// ─── HTML snapshot renderer ────────────────────────────────────────────────────

function webSection(data: FitScoreReportData): string {
  const el = createElement(
    'div',
    { className: 'space-y-4' },
    createElement(WebApplicantDetail, { applicants: data.applicants }),
    data.isAllForeignNational && !data.isLdp
      ? createElement(WebMethodologyEyebrow, { variant: 'foreign-national-evidentiary-class' })
      : null,
    createElement(WebDimCard, { data }),
  )
  return renderToStaticMarkup(el)
}

function wrapHtml(title: string, doctrineClaim: string, body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<script src="https://cdn.tailwindcss.com"></script>
<style>
/* Paper token overrides for Tailwind CDN (not processed by PostCSS) */
.bg-paper-sunk   { background-color: oklch(95% 0.006 95); }
.bg-paper-deeper { background-color: oklch(92% 0.008 95); }
:root { --border: oklch(88% 0.006 95); color-scheme: light; }
.border-border { border-color: var(--border); }
</style>
</head>
<body class="bg-gray-50 p-8 font-sans">
<div class="max-w-4xl mx-auto">
  <div class="mb-6 p-3 bg-amber-50 border border-amber-200 rounded text-sm">
    <div class="font-mono font-bold text-xs uppercase tracking-wider text-amber-800 mb-1">Density-Pass Snapshot — ${title}</div>
    <div class="text-amber-700 text-xs">${doctrineClaim}</div>
  </div>
  <div class="bg-white p-6 border border-gray-200 rounded-lg">
    ${body}
  </div>
</div>
</body>
</html>`
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  for (const d of DIRS) mkdirSync(path.join(BASE, d), { recursive: true })
  console.log(`Density-pass render → ${BASE}\n`)

  // 1 — Write fixture JSON files
  for (const { id, doctrineClaim, data } of FIXTURES) {
    const outPath = path.join(BASE, 'fixtures', `${id}.json`)
    writeFileSync(outPath, JSON.stringify({ doctrineClaim, data }, null, 2))
    console.log(`  fixture  ${id}.json`)
  }
  // Lock 2 shared base
  const lock2BasePath = path.join(BASE, 'fixtures', 'lock2-shared-base.json')
  writeFileSync(lock2BasePath, JSON.stringify({
    doctrineClaim: 'Lock 2 shared base (N=5). Slice applicants to N=2/3/4/5 for side-by-side mode comparison.',
    data: lock2Data(5),
  }, null, 2))
  console.log(`  fixture  lock2-shared-base.json\n`)

  // 2 — Render 15 PDFs + 15 HTMLs
  for (const { id, doctrineClaim, data } of FIXTURES) {
    // PDF
    try {
      const buf = await renderToBuffer(createElement(AgentMultiReport, { data }))
      writeFileSync(path.join(BASE, 'pdf', `${id}.pdf`), buf)
      console.log(`  pdf  ✓ ${id}.pdf  (${(buf.length / 1024).toFixed(1)} KB)`)
    } catch (err) {
      console.error(`  pdf  ✗ ${id}.pdf — ${err instanceof Error ? err.message : String(err)}`)
    }

    // HTML
    try {
      const body = webSection(data)
      const html = wrapHtml(id, doctrineClaim, body)
      writeFileSync(path.join(BASE, 'web', `${id}.html`), html)
      console.log(`  web  ✓ ${id}.html`)
    } catch (err) {
      console.error(`  web  ✗ ${id}.html — ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  console.log()

  // 3 — Lock 2 shared renders (N=2/3/4/5 slices)
  for (const n of [2, 3, 4, 5] as const) {
    const data = lock2Data(n)
    const label = `lock2-shared-N${n}`

    // PDF
    try {
      const buf = await renderToBuffer(createElement(AgentMultiReport, { data }))
      writeFileSync(path.join(BASE, 'lock2-shared', `${label}.pdf`), buf)
      console.log(`  lock2  ✓ ${label}.pdf  (${(buf.length / 1024).toFixed(1)} KB)`)
    } catch (err) {
      console.error(`  lock2  ✗ ${label}.pdf — ${err instanceof Error ? err.message : String(err)}`)
    }

    // HTML
    try {
      const claim = `Lock 2 shared N=${n}: same base fixture sliced to ${n} applicants. Mode = ${n === 2 ? 'interpretive' : n === 3 ? 'summary' : n === 4 ? 'comparative' : 'operational'}.`
      const body = webSection(data)
      const html = wrapHtml(label, claim, body)
      writeFileSync(path.join(BASE, 'lock2-shared', `${label}.html`), html)
      console.log(`  lock2  ✓ ${label}.html`)
    } catch (err) {
      console.error(`  lock2  ✗ ${label}.html — ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  console.log(`\nDone. Review output at ${BASE}`)
}

main().catch(err => {
  console.error('render-density-pass failed:', err)
  process.exit(1)
})
