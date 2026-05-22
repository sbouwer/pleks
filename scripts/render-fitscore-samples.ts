/**
 * scripts/render-fitscore-samples.ts — Render reference Stream 2 PDFs for visual review and Lock 3 sign-off
 *
 * Run:    npx tsx scripts/render-fitscore-samples.ts
 * Output: lib/reports/screening/__samples__/
 *
 * Notes:  In-memory fixtures only — no DB, no AI calls, no orchestrator. Templates are imported
 *         directly and rendered via @react-pdf/renderer's renderToBuffer.
 *         Narrative content is hand-written to be banned-phrase clean per DELIVERY.md §7.2.
 *         Material flag fixtures use the real flag class taxonomy per COMPOSITE.md §3.
 *         Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §10.6 (Phase E acceptance criteria H2).
 */
import { renderToBuffer } from "@react-pdf/renderer"
import { createElement } from "react"
import { writeFileSync, mkdirSync } from "node:fs"
import path from "node:path"

import { AgentSingleReport } from "@/lib/reports/screening/agent_single"
import { AgentMultiReport } from "@/lib/reports/screening/agent_multi"
import { AgentLimitedDataReport } from "@/lib/reports/screening/agent_limited_data"
import type {
  FitScoreReportData,
  FitScoreApplicantEntry,
  MaterialFlag,
  NarrativeResponse,
} from "@/lib/reports/screening/_primitives/theme"

const OUT_DIR = path.resolve(process.cwd(), 'lib/reports/screening/__samples__')

// ─── Narrative fixtures (banned-phrase clean per §7.2) ────────────────────────

const NARRATIVE_VS: NarrativeResponse = {
  observedStrengths: [
    'Income verified across three bureaus, aligning within a 30-point spread.',
    'Two prior tenancies recorded in good standing in the Pleks network.',
    'Identity match confirmed via Home Affairs DHA-NPR.',
    'Employment tenure 4 years 2 months at current employer.',
    'Rent at 18% of verified joint income.',
  ],
  observedConcerns: [],
  limitedVisibility: [],
  affordabilityEvidenceLine: 'Rent 18% of verified joint income; debt servicing 9%.',
  stabilityEvidenceLine:     'Income-weighted tenure 4.2 years; two rental references verified.',
  creditEvidenceLine:        'Coverage-weighted median across three bureaus; no outliers.',
  verificationEvidenceLine:  'Five of five checks passed; identity match foundational.',
  ldpSummary: null,
  isTemplated: false,
  failureReason: null,
}

const NARRATIVE_SP: NarrativeResponse = {
  observedStrengths: [
    'Identity match confirmed via Home Affairs DHA-NPR.',
    'Bureau coverage across two responding bureaus, scores aligned.',
    'Employment tenure 2 years 8 months at current employer.',
  ],
  observedConcerns: [
    'Bureau coverage limited to two of three contacted bureaus.',
  ],
  limitedVisibility: [
    'No prior tenancy history in the Pleks network.',
  ],
  affordabilityEvidenceLine: 'Rent 28% of verified joint income; debt servicing 14%.',
  stabilityEvidenceLine:     'Income-weighted tenure 2.7 years; one rental reference verified.',
  creditEvidenceLine:        'Coverage-weighted median across two bureaus; one bureau non-responding.',
  verificationEvidenceLine:  'Five of five checks passed; secondary reference present.',
  ldpSummary: null,
  isTemplated: false,
  failureReason: null,
}

const NARRATIVE_CR: NarrativeResponse = {
  observedStrengths: [
    'Identity match confirmed via Home Affairs DHA-NPR.',
    'Bank statement deposit pattern matches employer name.',
  ],
  observedConcerns: [
    'Rent 38% of verified joint income — above the 35% guideline.',
    'Sigma bureau reading diverged from cluster and was excluded as outlier.',
    'Variance of 18% between declared and bank-verified income.',
  ],
  limitedVisibility: [
    'No prior tenancy history in the Pleks network.',
    'Bank statement covers four months; default observation window is six.',
  ],
  affordabilityEvidenceLine: 'Rent 38% of verified joint income; debt servicing 22%.',
  stabilityEvidenceLine:     'Income-weighted tenure 1.4 years; no rental references verified.',
  creditEvidenceLine:        'Coverage-weighted median across two bureaus; one reading excluded as outlier.',
  verificationEvidenceLine:  'Four of five checks passed; salary reconciliation showed 18% variance.',
  ldpSummary: null,
  isTemplated: false,
  failureReason: null,
}

const NARRATIVE_LC: NarrativeResponse = {
  observedStrengths: [
    'Identity match confirmed via Home Affairs DHA-NPR.',
  ],
  observedConcerns: [
    'Rent 42% of verified joint income — above the 35% guideline.',
    'Single bureau responded; coverage limited.',
    'Active judgment recorded in bureau response within last 24 months.',
  ],
  limitedVisibility: [
    'Two of three bureaus did not respond.',
    'No bank statement supplied; income evidence Tier 4 (declared only).',
    'No prior tenancy history in the Pleks network.',
  ],
  affordabilityEvidenceLine: 'Rent 42% of verified joint income; debt servicing not assessed.',
  stabilityEvidenceLine:     'Income-weighted tenure not recorded; no rental references verified.',
  creditEvidenceLine:        'Single bureau responded; capping flag for recent judgment within 24 months.',
  verificationEvidenceLine:  'Three of five checks passed; salary reconciliation not attempted.',
  ldpSummary: null,
  isTemplated: false,
  failureReason: null,
}

const NARRATIVE_AS: NarrativeResponse = {
  observedStrengths: [],
  observedConcerns: [
    'Debt review active per bureau response.',
    'Two adverse listings recorded across responding bureaus.',
    'Rent 46% of verified joint income.',
    'Material income discrepancy: 52% variance between declared and bank-verified.',
  ],
  limitedVisibility: [
    'No prior tenancy history in the Pleks network.',
  ],
  affordabilityEvidenceLine: 'Rent 46% of verified joint income; debt servicing 31%.',
  stabilityEvidenceLine:     'Income-weighted tenure 0.8 years; no rental references verified.',
  creditEvidenceLine:        'Two bureaus responded; debt review active and two adverse listings.',
  verificationEvidenceLine:  'Three of five checks passed; salary reconciliation failed.',
  ldpSummary: null,
  isTemplated: false,
  failureReason: null,
}

const NARRATIVE_BL: NarrativeResponse = {
  observedStrengths: [],
  observedConcerns: [
    'SAFPS fraud-listing match returned for the applicant identity number.',
    'Bureau response shows multiple adverse listings.',
  ],
  limitedVisibility: [],
  affordabilityEvidenceLine: 'Rent 33% of verified joint income.',
  stabilityEvidenceLine:     'Income-weighted tenure 1.1 years.',
  creditEvidenceLine:        'Three bureaus responded; SAFPS match recorded.',
  verificationEvidenceLine:  'Four of five checks passed; identity match foundational.',
  ldpSummary: null,
  isTemplated: false,
  failureReason: null,
}

const NARRATIVE_LDP: NarrativeResponse = {
  observedStrengths: [],
  observedConcerns: [],
  limitedVisibility: [],
  affordabilityEvidenceLine: '',
  stabilityEvidenceLine:     '',
  creditEvidenceLine:        null,
  verificationEvidenceLine:  '',
  ldpSummary: 'Engine did not produce a composite score — only one of four core signal sources met the data-coverage threshold.',
  isTemplated: false,
  failureReason: null,
}

const NARRATIVE_FOREIGN: NarrativeResponse = {
  observedStrengths: [
    'Identity match confirmed via Home Affairs DHA-NPR.',
    'Employment tenure 2 years 6 months on current work permit.',
    'Bank statement deposit pattern matches employer name.',
  ],
  observedConcerns: [
    'Work permit expires 2027-08-15 — within the proposed lease term.',
  ],
  limitedVisibility: [
    'Credit Behaviour dimension not assessed — SA bureaus have no meaningful coverage for foreign nationals.',
  ],
  affordabilityEvidenceLine: 'Rent 24% of verified income.',
  stabilityEvidenceLine:     'Work permit tenure 2.5 years; one rental reference verified.',
  creditEvidenceLine:        null,
  verificationEvidenceLine:  'Five of five checks passed; identity match foundational.',
  ldpSummary: null,
  isTemplated: false,
  failureReason: null,
}

const NARRATIVE_MULTI: NarrativeResponse = {
  observedStrengths: [
    'Applicant A trusted by Pleks Network — one prior tenancy in good standing.',
    'Joint verified income R 71,000 against rent of R 19,500.',
    'Identity match confirmed for all three applicants.',
    'Bureau coverage across three bureaus for SA applicants.',
  ],
  observedConcerns: [
    'Applicant C work permit expires 2027-12-31 — within the proposed lease term.',
  ],
  limitedVisibility: [
    'No bureau coverage for Applicant C (foreign national).',
  ],
  affordabilityEvidenceLine: 'Rent 27% of verified joint income; debt servicing 12%.',
  stabilityEvidenceLine:     'Income-weighted tenure 3.1 years; two rental references verified.',
  creditEvidenceLine:        'Coverage-weighted median across three bureaus for two of three applicants.',
  verificationEvidenceLine:  'Fourteen of fifteen checks passed across all applicants.',
  ldpSummary: null,
  isTemplated: false,
  failureReason: null,
}

// ─── Material flag fixtures ───────────────────────────────────────────────────

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
    source: 'sample_fixture',
    observedAt: '2026-05-22T10:00:00Z',
  } as MaterialFlag
}

const FLAG_TRUSTED       = flag('pleks_network_trusted',    'trust',    'Trusted by Pleks Network', null, 'Applicant A')
const FLAG_BUREAU_THIN   = flag('bureau_coverage_partial',  'capping',  'Bureau coverage partial', 'stable_profile')
const FLAG_ID_REISSUE    = flag('recent_id_reissue',        'capping',  'ID reissued within last 12 months', 'stable_profile', 'Applicant A')
const FLAG_INCOME_DISC   = flag('material_income_discrepancy', 'capping', 'Material income discrepancy (52% variance)', 'cautious_review')
const FLAG_JUDGMENT      = flag('active_judgment',          'capping',  'Active judgment recorded in last 24 months', 'limited_confidence', 'Applicant A')
const FLAG_DEBT_REVIEW   = flag('debt_review_active',       'capping',  'Debt review active', 'cautious_review', 'Applicant A')
const FLAG_SAFPS         = flag('safps_fraud_match',        'critical', 'SAFPS fraud-listing match', null, 'Applicant A')
const FLAG_PERMIT_EXPIRY = flag('permit_expires_within_lease', 'capping', 'Work permit expires within proposed lease term', 'stable_profile', 'Applicant C')

// ─── Applicant fixtures ───────────────────────────────────────────────────────

function saApplicant(overrides: Partial<FitScoreApplicantEntry> = {}): FitScoreApplicantEntry {
  return {
    label: 'A',
    fullName: 'Jane Mokoena',
    nationalityStatus: 'SA Citizen',
    verifiedIncomeCents: 4500000,
    incomeSharePct: 100,
    verificationPassCount: 5,
    verificationTotal: 5,
    respondingBureaus: ['TransUnion', 'VeriCred', 'Sigma'],
    pleksNetworkStatus: 'trusted',
    pleksNetworkTenancyCount: 1,
    isForeignNational: false,
    ...overrides,
  }
}

function foreignApplicant(overrides: Partial<FitScoreApplicantEntry> = {}): FitScoreApplicantEntry {
  return {
    label: 'A',
    fullName: 'Amara Okonkwo',
    nationalityStatus: 'Foreign National (Work Permit, expires 2027-08-15)',
    verifiedIncomeCents: 5200000,
    incomeSharePct: 100,
    verificationPassCount: 5,
    verificationTotal: 5,
    respondingBureaus: [],
    pleksNetworkStatus: 'none',
    pleksNetworkTenancyCount: 0,
    isForeignNational: true,
    ...overrides,
  }
}

// ─── Base FitScoreReportData fixture ──────────────────────────────────────────

function baseData(overrides: Partial<FitScoreReportData> = {}): FitScoreReportData {
  return {
    applicationRef: 'app-sample-001',
    unitLabel: '2-bedroom apartment, Sea Point, Cape Town',
    generatedAt: '2026-05-22T10:00:00Z',
    primaryApplicantName: 'Jane Mokoena',
    coApplicantCount: 0,
    applicants: [saApplicant()],
    band: 'stable_profile',
    score: 78,
    confidenceIndex: 'medium',
    verificationIntegrity: 'high',
    dimensionalScores: {
      affordability:        72,
      stability:            78,
      creditBehaviour:      75,
      verificationIntegrity: 85,
    },
    materialFlags: [],
    isLdp: false,
    isAllForeignNational: false,
    narrative: NARRATIVE_SP,
    engineVersion:         'fitscore.v1.0',
    narrativeVersion:      'narr.v1.0',
    interpretationVersion: 'interpretation.v1.0',
    inputsHash:            'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6',
    orgName:               'Pleks Sample Agency',
    ...overrides,
  }
}

// ─── Scenarios ────────────────────────────────────────────────────────────────

interface Scenario {
  name: string
  data: FitScoreReportData
  variant: 'single' | 'multi' | 'ldp'
}

const SCENARIOS: Scenario[] = [
  {
    name: '01_verified_stability_single_sa',
    variant: 'single',
    data: baseData({
      band: 'verified_stability', score: 92,
      confidenceIndex: 'high', verificationIntegrity: 'high',
      dimensionalScores: { affordability: 88, stability: 92, creditBehaviour: 94, verificationIntegrity: 95 },
      materialFlags: [FLAG_TRUSTED],
      narrative: NARRATIVE_VS,
      applicants: [saApplicant({ pleksNetworkTenancyCount: 3, verifiedIncomeCents: 6800000 })],
    }),
  },
  {
    name: '02_stable_profile_single_sa',
    variant: 'single',
    data: baseData({
      band: 'stable_profile', score: 78,
      materialFlags: [FLAG_BUREAU_THIN],
      applicants: [saApplicant({ respondingBureaus: ['TransUnion', 'VeriCred'], pleksNetworkStatus: 'none', pleksNetworkTenancyCount: 0 })],
    }),
  },
  {
    name: '03_cautious_review_single_sa',
    variant: 'single',
    data: baseData({
      band: 'cautious_review', score: 62,
      confidenceIndex: 'medium', verificationIntegrity: 'medium',
      dimensionalScores: { affordability: 55, stability: 60, creditBehaviour: 68, verificationIntegrity: 70 },
      materialFlags: [FLAG_INCOME_DISC, FLAG_ID_REISSUE],
      narrative: NARRATIVE_CR,
      applicants: [saApplicant({ respondingBureaus: ['TransUnion', 'VeriCred'], verificationPassCount: 4, pleksNetworkStatus: 'none', pleksNetworkTenancyCount: 0, verifiedIncomeCents: 3200000 })],
    }),
  },
  {
    name: '04_limited_confidence_single_sa',
    variant: 'single',
    data: baseData({
      band: 'limited_confidence', score: 48,
      confidenceIndex: 'low', verificationIntegrity: 'medium',
      dimensionalScores: { affordability: 42, stability: 45, creditBehaviour: 50, verificationIntegrity: 60 },
      materialFlags: [FLAG_JUDGMENT, FLAG_BUREAU_THIN],
      narrative: NARRATIVE_LC,
      applicants: [saApplicant({ respondingBureaus: ['TransUnion'], verificationPassCount: 3, pleksNetworkStatus: 'none', pleksNetworkTenancyCount: 0, verifiedIncomeCents: 2800000 })],
    }),
  },
  {
    name: '05_adverse_signals_single_sa',
    variant: 'single',
    data: baseData({
      band: 'adverse_signals', score: 32,
      confidenceIndex: 'medium', verificationIntegrity: 'low',
      dimensionalScores: { affordability: 28, stability: 30, creditBehaviour: 25, verificationIntegrity: 50 },
      materialFlags: [FLAG_DEBT_REVIEW, FLAG_INCOME_DISC],
      narrative: NARRATIVE_AS,
      applicants: [saApplicant({ respondingBureaus: ['TransUnion', 'VeriCred'], verificationPassCount: 3, pleksNetworkStatus: 'none', pleksNetworkTenancyCount: 0, verifiedIncomeCents: 2400000 })],
    }),
  },
  {
    name: '06_blocked_single_sa',
    variant: 'single',
    data: baseData({
      band: 'blocked', score: null,
      confidenceIndex: 'medium', verificationIntegrity: 'medium',
      dimensionalScores: { affordability: 65, stability: 60, creditBehaviour: 40, verificationIntegrity: 72 },
      materialFlags: [FLAG_SAFPS],
      narrative: NARRATIVE_BL,
      applicants: [saApplicant({ pleksNetworkStatus: 'none', pleksNetworkTenancyCount: 0 })],
    }),
  },
  {
    name: '07_limited_data_profile_single',
    variant: 'ldp',
    data: baseData({
      band: 'limited_data_profile', score: null,
      confidenceIndex: 'insufficient', verificationIntegrity: 'limited',
      isLdp: true,
      materialFlags: [FLAG_BUREAU_THIN],
      narrative: NARRATIVE_LDP,
      applicants: [saApplicant({ respondingBureaus: [], verificationPassCount: 1, pleksNetworkStatus: 'none', pleksNetworkTenancyCount: 0, verifiedIncomeCents: 0 })],
    }),
  },
  {
    name: '08_stable_profile_multi_mixed',
    variant: 'multi',
    data: baseData({
      band: 'stable_profile', score: 76,
      primaryApplicantName: 'Jane Mokoena',
      coApplicantCount: 2,
      materialFlags: [FLAG_TRUSTED, FLAG_PERMIT_EXPIRY],
      narrative: NARRATIVE_MULTI,
      applicants: [
        saApplicant({ label: 'A', fullName: 'Jane Mokoena',     verifiedIncomeCents: 3500000, incomeSharePct: 49 }),
        saApplicant({ label: 'B', fullName: 'Sipho Dlamini',    verifiedIncomeCents: 2400000, incomeSharePct: 34, pleksNetworkStatus: 'none', pleksNetworkTenancyCount: 0, respondingBureaus: ['TransUnion', 'VeriCred'] }),
        foreignApplicant({ label: 'C', fullName: 'Amara Okonkwo', verifiedIncomeCents: 1200000, incomeSharePct: 17, nationalityStatus: 'Foreign National (Work Permit, expires 2027-12-31)' }),
      ],
    }),
  },
  {
    name: '09_stable_profile_single_foreign',
    variant: 'single',
    data: baseData({
      band: 'stable_profile', score: 74,
      primaryApplicantName: 'Amara Okonkwo',
      isAllForeignNational: true,
      dimensionalScores: { affordability: 78, stability: 70, creditBehaviour: 0, verificationIntegrity: 85 },
      narrative: NARRATIVE_FOREIGN,
      applicants: [foreignApplicant()],
    }),
  },
]

// ─── Render loop ──────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  mkdirSync(OUT_DIR, { recursive: true })

  console.log(`Rendering ${SCENARIOS.length} sample PDFs to ${OUT_DIR}\n`)

  for (const { name, data, variant } of SCENARIOS) {
    const Template =
      variant === 'ldp'   ? AgentLimitedDataReport :
      variant === 'multi' ? AgentMultiReport :
                            AgentSingleReport

    try {
      const buffer = await renderToBuffer(createElement(Template, { data }))
      const outPath = path.join(OUT_DIR, `${name}.pdf`)
      writeFileSync(outPath, buffer)
      console.log(`  ✓ ${name}.pdf (${(buffer.length / 1024).toFixed(1)} KB)`)
    } catch (err) {
      console.error(`  ✗ ${name}.pdf — ${err instanceof Error ? err.message : String(err)}`)
      throw err
    }
  }

  console.log(`\nDone. Review PDFs at ${OUT_DIR}`)
}

main().catch(err => {
  console.error('Sample render failed:', err)
  process.exit(1)
})
