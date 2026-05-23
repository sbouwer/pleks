/**
 * scripts/render-fitscore-smoke.ts — FitScore PDF smoke render (E.1–E.6 surface)
 *
 * Run:    npm run fitscore:render-smoke
 * Output: lib/reports/screening/_pdf/__samples__/fitscore-*.pdf
 *
 * Nine fixtures, nine PDFs:
 *   skeleton   — creditAnalysis absent; exercises all PENDING placeholder states.
 *   populated  — creditAnalysis present (3 bureaus, 5 checks, 1 absent).
 *   deficit    — populated + creditBehaviour 55; exercises amber-wash deficit bar.
 *   with-flag  — populated + additional critical material flag.
 *   ldp        — band=limited_data_profile; exercises notAssessed placeholders + LDP synthesis.
 *   multi-2    — 2 applicants; ApplicantDetail rich tier (N=2 stacked cards).
 *   multi-3    — 3 applicants; ApplicantDetail medium tier (N=3 third-page cards).
 *   multi-4    — 4 applicants; ApplicantDetail compact tier (N=4 2x2 grid).
 *   multi-6    — 6 applicants; ApplicantDetail tabular tier (N>=5 list with page overflow).
 *
 * FITSCORE_FONT_SOURCE=local is injected by the npm script via cross-env.
 * Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §E.3, §E.5, §E.6 acceptance criteria.
 */

import { Document, renderToBuffer } from "@react-pdf/renderer"
import { createElement as h } from "react"
import { writeFileSync, mkdirSync } from "node:fs"
import path from "node:path"

import { DocumentShell }          from "@/lib/reports/screening/_pdf/primitives/DocumentShell"
import { EditorialHeadline }      from "@/lib/reports/screening/_pdf/primitives/EditorialHeadline"
import { MetaStrip }              from "@/lib/reports/screening/_pdf/primitives/MetaStrip"
import { IdentityRow }            from "@/lib/reports/screening/_pdf/primitives/IdentityRow"
import { ApplicantDetail }         from "@/lib/reports/screening/_pdf/primitives/ApplicantDetail"
import { BandLadder }             from "@/lib/reports/screening/_pdf/primitives/BandLadder"
import { DimensionCardEditorial } from "@/lib/reports/screening/_pdf/primitives/DimensionCardEditorial"
import { DimensionReadingGuide }  from "@/lib/reports/screening/_pdf/primitives/DimensionReadingGuide"

import { IncomeReconciliationTable } from "@/lib/reports/screening/_pdf/primitives/IncomeReconciliationTable"
import { ExpenditureTable }          from "@/lib/reports/screening/_pdf/primitives/ExpenditureTable"
import { RiskUncertaintySplit }      from "@/lib/reports/screening/_pdf/primitives/RiskUncertaintySplit"
import { BureauCoverageMatrix }      from "@/lib/reports/screening/_pdf/primitives/BureauCoverageMatrix"
import { VerificationCheckTable }    from "@/lib/reports/screening/_pdf/primitives/VerificationCheckTable"
import { ObservedStrengths }         from "@/lib/reports/screening/_pdf/primitives/ObservedStrengths"
import { AssessmentSynthesis }       from "@/lib/reports/screening/_pdf/primitives/AssessmentSynthesis"
import { DocumentReadingGuide }      from "@/lib/reports/screening/_pdf/primitives/DocumentReadingGuide"
import { AttestationCard }           from "@/lib/reports/screening/_pdf/primitives/AttestationCard"

import type { FitScoreReportData, FitScoreCreditAnalysis } from "@/lib/reports/screening/_pdf/primitives/theme"

const OUT_DIR = path.resolve(process.cwd(), 'lib/reports/screening/_pdf/__samples__')

// ─── Base fixture ─────────────────────────────────────────────────────────────

const BASE: FitScoreReportData = {
  applicationRef:       'PLK-2026-E2SM',
  unitLabel:            '2-bedroom apartment, Sea Point, Cape Town',
  generatedAt:          '2026-05-22T10:15:00+02:00',
  submittedAt:          '2026-05-19T09:00:00+02:00',
  primaryApplicantName: 'Thandi Nkosi',
  coApplicantCount:     0,
  applicants: [
    {
      label:                 'Applicant A',
      fullName:              'Thandi Nkosi',
      nationalityStatus:     'SA Citizen',
      idNumberMasked:        '9203****082',
      sex:                   'F',
      ageYears:              34,
      employment: {
        employerName:  'Cape Digital Solutions (Pty) Ltd',
        jobTitle:      'Product Manager',
        tenureDisplay: '3y 2mo',
      },
      verifiedIncomeCents:      3800000,
      incomeSharePct:           100,
      verificationPassCount:    5,
      verificationTotal:        5,
      respondingBureaus:        ['TransUnion', 'Experian', 'VeriCred'],
      pleksNetworkStatus:       'trusted',
      pleksNetworkTenancyCount: 1,
      isForeignNational:        false,
    },
  ],
  leaseIntent: {
    termMonths:        12,
    monthlyRentCents:  1200000,
    depositMultiplier: 2,
  },
  band:                   'stable_profile',
  score:                  82,
  confidenceIndex:        'high',
  verificationIntegrity:  'high',
  dimensionalScores: {
    affordability:                             84,
    stability:                                 78,
    creditBehaviour:                           80,
    verificationIntegrity:                     92,
    affordability_preferred_threshold:         70,
    stability_preferred_threshold:             60,
    creditBehaviour_preferred_threshold:       65,
    verificationIntegrity_preferred_threshold: 80,
  },
  materialFlags: [
    { flag: 'network_positive', class: 'trust',    description: 'Pleks network: 1 tenancy in good standing', observedAt: '2026-05-22T10:15:00Z' },
    { flag: 'income_variance',  class: 'capping',  description: 'Declared vs verified income variance 8%',   observedAt: '2026-05-22T10:15:00Z' },
    { flag: 'bureau_gap',       class: 'critical', description: 'One bureau did not respond',                 observedAt: '2026-05-22T10:15:00Z' },
  ],
  isLdp:                false,
  isAllForeignNational: false,
  narrative: {
    observedStrengths: [
      'Income verified across three bureaus; Delphi score above band threshold.',
      'One prior tenancy in good standing via Pleks network.',
      'All five verification checks passed with no overrides.',
    ],
    observedConcerns: [
      'One bureau did not respond; coverage is 2 of 3.',
      'Declared vs verified income variance of 8%.',
    ],
    limitedVisibility: ['Employment tenure not available; stability score provisional.'],
    affordabilityEvidenceLine: 'Rent 32% of verified income; within preferred threshold.',
    stabilityEvidenceLine:     'Employment tenure 3.2 years; one rental reference verified.',
    creditEvidenceLine:        'Two of three bureaus responded; no adverse listings.',
    verificationEvidenceLine:  'Five of five checks passed; identity match foundational.',
    affordabilityObservations: [
      'Rent 32% of verified income; below the 40% soft ceiling.',
      'No debt servicing data present for this applicant.',
      'Disposable income positive at verified income level.',
    ],
    stabilityObservations: [
      'Employment tenure 3.2 years at current employer.',
      'One prior rental reference verified on record.',
      'Address history gap: no move data supplied for this applicant.',
    ],
    creditObservations: [
      'TransUnion and Experian responded; VeriCred did not.',
      'No adverse listings recorded across responding bureaus.',
      'No bureau divergence detected between TransUnion and Experian.',
    ],
    verificationObservations: [
      'Five of five checks passed across all verification categories.',
      'Identity match confirmed as foundational signal.',
      'No outstanding verification gaps or overrides pending.',
    ],
    ldpSummary:    null,
    isTemplated:   false,
    failureReason: null,
  },
  engineVersion:         'fitscore.v1.0.1',
  narrativeVersion:      'narr.v1.1',
  interpretationVersion: 'interpretation.v1.0',
  synthesisVersion:      'synthesis.v1.0.2',
  inputsHash:            'b2c3d4e5f6789000b2c3d4e5f6789000b2c3d4e5f6789000b2c3d4e5f6789000',
  orgName:               'Pleks Demo Agency',
  orgFfcNumber:          'FFC 2026-097 431',
  dimensions: {
    affordability: { rentToIncomePct: 32, windowMonths: 6 },
    stability:     { currentTenureDisplay: '3y 2mo', employersIn7Years: 2 },
    credit:        { bureauCoverageDisplay: '2 / 3', divergencePoints: null },
    verification:  { checksPassedDisplay: '5 / 5', manualOverridesPending: 0, auditEntriesCount: 5 },
  },
}

// ─── Credit analysis fixture (populated variant) ──────────────────────────────

const CREDIT_ANALYSIS: FitScoreCreditAnalysis = {
  bureausResponding:     3,
  bureausSolicited:      3,
  bureauEntries: [
    {
      name:            'TransUnion',
      subLabel:        'Empirica score',
      coveragePips:    5,
      coverageLabel:   'Full coverage',
      tradeLines:      '8',
      adverseListings: '0',
      reportedScore:   718,
    },
    {
      name:            'Experian',
      subLabel:        'Delphi score',
      coveragePips:    4,
      coverageLabel:   'Coverage 4/5',
      tradeLines:      '7',
      adverseListings: '0',
      reportedScore:   702,
    },
    {
      name:            'VeriCred',
      subLabel:        'Composite',
      coveragePips:    3,
      coverageLabel:   'Coverage 3/5',
      tradeLines:      '5',
      adverseListings: '—',
      reportedScore:   651,
    },
  ],
  verificationsLabel:      '5 of 5 checks passed',
  verificationsQueryLabel: 'queried 22 May 2026',
  verificationChecks: [
    {
      checkName:    'Identity match',
      checkSub:     'DHA · SA ID',
      source:       'DHA',
      method:       'ID number + biometric',
      outcomeType:  'pass',
      outcomeLabel: 'Consistent across all sources',
      evidenceNote: '',
    },
    {
      checkName:    'Income verification',
      checkSub:     'Payslip + bank statement',
      source:       'Employer',
      method:       'Payslip + bank reconciliation',
      outcomeType:  'partial',
      outcomeLabel: '8% variance',
      evidenceNote: 'Declared R38,500; verified R35,420 (6-mo mean)',
    },
    {
      checkName:    'Employment verification',
      checkSub:     'Employer attestation',
      source:       'Employer HR',
      method:       'Direct enquiry',
      outcomeType:  'pass',
      outcomeLabel: 'Active employment confirmed',
      evidenceNote: '',
    },
    {
      checkName:    'Address history',
      checkSub:     'Bureau move data',
      source:       '—',
      method:       '—',
      outcomeType:  'absent',
      outcomeLabel: '',
      evidenceNote: 'No move data supplied for this applicant',
    },
    {
      checkName:    'Rental reference',
      checkSub:     'Pleks network',
      source:       'Pleks network',
      method:       'Internal tenancy lookup',
      outcomeType:  'pass',
      outcomeLabel: '1 prior tenancy in good standing',
      evidenceNote: '',
    },
  ],
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const FIXTURE_SKELETON:  FitScoreReportData = BASE
const FIXTURE_POPULATED: FitScoreReportData = { ...BASE, creditAnalysis: CREDIT_ANALYSIS }

// Deficit fixture: credit dimension scores below threshold → State B bar on Credit Behaviour card.
const FIXTURE_DEFICIT: FitScoreReportData = {
  ...BASE,
  creditAnalysis: CREDIT_ANALYSIS,
  dimensionalScores: {
    ...BASE.dimensionalScores,
    creditBehaviour: 55,  // below creditBehaviour_preferred_threshold (65) → deficit bar state
  },
}

// With-flag fixture: one critical material flag → exercises synthesis v1.0.2 critical-flag sentence.
const FIXTURE_WITH_FLAG: FitScoreReportData = {
  ...FIXTURE_POPULATED,
  materialFlags: [
    ...BASE.materialFlags,
    {
      flag:           'adverse_credit',
      class:          'critical',
      description:    'Adverse listing recorded at TransUnion within 12 months',
      source:         'bureau',
      capApplied:     false,
      capCeiling:     null,
      applicantId:    null,
      applicantLabel: null,
      observedAt:     '2026-05-22T10:15:00Z',
    },
  ],
}

// ─── Shared applicant entries (reused across multi fixtures) ──────────────────

const APP_A = {
  label: 'A', fullName: 'Thandi Nkosi', nationalityStatus: 'SA Citizen',
  idNumberMasked: '9203****082', sex: 'F', ageYears: 34,
  employment: { employerName: 'Cape Digital Solutions (Pty) Ltd', jobTitle: 'Product Manager', tenureDisplay: '3y 2mo' },
  verificationPassCount: 5, verificationTotal: 5,
  respondingBureaus: ['TransUnion', 'Experian', 'VeriCred'],
  pleksNetworkStatus: 'trusted' as const, pleksNetworkTenancyCount: 1, isForeignNational: false,
}

const APP_B = {
  label: 'B', fullName: 'Daniel Khumalo', nationalityStatus: 'SA Citizen',
  idNumberMasked: '8811****094', sex: 'M', ageYears: 37,
  employment: { employerName: 'Khumalo Engineering (Pty) Ltd', jobTitle: 'Senior Engineer', tenureDisplay: '5y 8mo' },
  verificationPassCount: 5, verificationTotal: 5,
  respondingBureaus: ['TransUnion', 'Experian'],
  pleksNetworkStatus: 'none' as const, pleksNetworkTenancyCount: 0, isForeignNational: false,
}

const APP_C = {
  label: 'C', fullName: 'Zanele Mokoena', nationalityStatus: 'SA Citizen',
  idNumberMasked: '9708****061', sex: 'F', ageYears: 28,
  employment: { employerName: 'Mokoena & Associates', jobTitle: 'Graphic Designer', tenureDisplay: '2y 1mo' },
  verificationPassCount: 4, verificationTotal: 5,
  respondingBureaus: ['TransUnion', 'Experian'],
  pleksNetworkStatus: 'none' as const, pleksNetworkTenancyCount: 0, isForeignNational: false,
}

const APP_D = {
  label: 'D', fullName: 'Sipho Dlamini', nationalityStatus: 'SA Citizen',
  idNumberMasked: '8304****074', sex: 'M', ageYears: 42,
  employment: { employerName: 'Dlamini Property Group', jobTitle: 'Operations Director', tenureDisplay: '8y 4mo' },
  verificationPassCount: 5, verificationTotal: 5,
  respondingBureaus: ['TransUnion', 'Experian', 'VeriCred'],
  pleksNetworkStatus: 'trusted' as const, pleksNetworkTenancyCount: 2, isForeignNational: false,
}

const APP_E = {
  label: 'E', fullName: 'Lerato Sithole', nationalityStatus: 'Foreign National (Work Permit)',
  idNumberMasked: '', sex: 'F', ageYears: 31,
  employment: { employerName: 'Stellenbosch Consulting Inc.', jobTitle: 'Business Analyst', tenureDisplay: '1y 6mo' },
  verificationPassCount: 3, verificationTotal: 5,
  respondingBureaus: ['TransUnion'],
  pleksNetworkStatus: 'none' as const, pleksNetworkTenancyCount: 0, isForeignNational: true,
}

const APP_F = {
  label: 'F', fullName: 'Tumelo Moagi', nationalityStatus: 'SA Citizen',
  idNumberMasked: '9512****083', sex: 'M', ageYears: 29,
  employment: { employerName: 'Moagi Creative Studio', jobTitle: 'Art Director', tenureDisplay: '3y 9mo' },
  verificationPassCount: 4, verificationTotal: 5,
  respondingBureaus: ['TransUnion', 'Experian'],
  pleksNetworkStatus: 'none' as const, pleksNetworkTenancyCount: 0, isForeignNational: false,
}

// Multi fixtures — same band/composite/dimensional scores in all; only applicant count varies.
// Validates ApplicantDetail density tiers: rich (N=2), medium (N=3), compact (N=4), tabular (N>=5).

const FIXTURE_MULTI_2: FitScoreReportData = {
  ...FIXTURE_POPULATED,
  primaryApplicantName: 'Thandi Nkosi',
  coApplicantCount:     1,
  applicants: [
    { ...APP_A, verifiedIncomeCents: 3800000, incomeSharePct: 62 },
    { ...APP_B, verifiedIncomeCents: 2320000, incomeSharePct: 38 },
  ],
}

const FIXTURE_MULTI_3: FitScoreReportData = {
  ...FIXTURE_POPULATED,
  primaryApplicantName: 'Thandi Nkosi',
  coApplicantCount:     2,
  applicants: [
    { ...APP_A, verifiedIncomeCents: 3800000, incomeSharePct: 45 },
    { ...APP_B, verifiedIncomeCents: 2700000, incomeSharePct: 32 },
    { ...APP_C, verifiedIncomeCents: 1950000, incomeSharePct: 23 },
  ],
}

const FIXTURE_MULTI_4: FitScoreReportData = {
  ...FIXTURE_POPULATED,
  primaryApplicantName: 'Thandi Nkosi',
  coApplicantCount:     3,
  applicants: [
    { ...APP_A, verifiedIncomeCents: 2800000, incomeSharePct: 32 },
    { ...APP_B, verifiedIncomeCents: 2200000, incomeSharePct: 25 },
    { ...APP_C, verifiedIncomeCents: 1900000, incomeSharePct: 22 },
    { ...APP_D, verifiedIncomeCents: 1900000, incomeSharePct: 21 },
  ],
}

const FIXTURE_MULTI_6: FitScoreReportData = {
  ...FIXTURE_POPULATED,
  primaryApplicantName: 'Thandi Nkosi',
  coApplicantCount:     5,
  applicants: [
    { ...APP_A, verifiedIncomeCents: 2000000, incomeSharePct: 22 },
    { ...APP_B, verifiedIncomeCents: 1720000, incomeSharePct: 19 },
    { ...APP_C, verifiedIncomeCents: 1540000, incomeSharePct: 17 },
    { ...APP_D, verifiedIncomeCents: 1450000, incomeSharePct: 16 },
    { ...APP_E, verifiedIncomeCents: 1270000, incomeSharePct: 14 },
    { ...APP_F, verifiedIncomeCents: 1090000, incomeSharePct: 12 },
  ],
}

// LDP fixture: stability + verificationIntegrity scored; affordability + creditBehaviour null.
// Exercises E.5 state: notAssessed PlaceholderCards, LDP synthesis paragraph, insufficient confidence.
const FIXTURE_LDP: FitScoreReportData = {
  ...BASE,
  band:            'limited_data_profile',
  score:           null,
  confidenceIndex: 'insufficient',
  isLdp:           true,
  synthesisVersion: 'synthesis.v1.0.2',
  dimensionalScores: {
    affordability:                             null,
    stability:                                 72,
    creditBehaviour:                           null,
    verificationIntegrity:                     88,
    affordability_preferred_threshold:         70,
    stability_preferred_threshold:             60,
    creditBehaviour_preferred_threshold:       65,
    verificationIntegrity_preferred_threshold: 80,
  },
  materialFlags: [
    { flag: 'network_positive', class: 'trust',    description: 'Pleks network: 1 tenancy in good standing', observedAt: '2026-05-22T10:15:00Z', source: '', capApplied: false, capCeiling: null, applicantId: null, applicantLabel: null },
    { flag: 'income_absent',    class: 'critical', description: 'Income evidence absent; bureau fallback only', observedAt: '2026-05-22T10:15:00Z', source: '', capApplied: false, capCeiling: null, applicantId: null, applicantLabel: null },
  ],
  narrative: {
    ...BASE.narrative,
    ldpSummary: 'Affordability and credit behaviour dimensions had insufficient data to score.',
  },
}

// ─── Document factory ─────────────────────────────────────────────────────────

function buildDoc(data: FitScoreReportData) {
  return h(Document, {},
    h(DocumentShell, { data, section: 'Profile' },
      h(EditorialHeadline,    { data }),
      h(MetaStrip,            { data }),
      h(IdentityRow,          { data }),
      h(BandLadder,           { data }),
      h(ApplicantDetail,      { applicants: data.applicants }),
      h(DimensionCardEditorial, { data }),
      h(DimensionReadingGuide,  {}),
    ),
    h(DocumentShell, { data, section: 'Financial Analysis' },
      h(IncomeReconciliationTable, { data }),
      h(ExpenditureTable,          { data }),
      h(RiskUncertaintySplit,      { data }),
    ),
    h(DocumentShell, { data, section: 'Evidence & Credit' },
      h(BureauCoverageMatrix,   { data }),
      h(VerificationCheckTable, { data }),
    ),
    h(DocumentShell, { data, section: 'Narrative' },
      h(ObservedStrengths,   { data }),
      h(AssessmentSynthesis, { data }),
    ),
    h(DocumentShell, { data, section: 'Document Attestation' },
      h(DocumentReadingGuide, {}),
      h(AttestationCard,      { data }),
    ),
  )
}

// ─── Render ───────────────────────────────────────────────────────────────────

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })

  const skeletonBuf = await renderToBuffer(buildDoc(FIXTURE_SKELETON))
  const skeletonPath = path.join(OUT_DIR, 'fitscore-skeleton-smoke.pdf')
  writeFileSync(skeletonPath, skeletonBuf)
  console.log(`✓  ${skeletonPath}  (${(skeletonBuf.byteLength / 1024).toFixed(1)} KB)`)

  const populatedBuf = await renderToBuffer(buildDoc(FIXTURE_POPULATED))
  const populatedPath = path.join(OUT_DIR, 'fitscore-populated-smoke.pdf')
  writeFileSync(populatedPath, populatedBuf)
  console.log(`✓  ${populatedPath}  (${(populatedBuf.byteLength / 1024).toFixed(1)} KB)`)

  const deficitBuf = await renderToBuffer(buildDoc(FIXTURE_DEFICIT))
  const deficitPath = path.join(OUT_DIR, 'fitscore-deficit-smoke.pdf')
  writeFileSync(deficitPath, deficitBuf)
  console.log(`✓  ${deficitPath}  (${(deficitBuf.byteLength / 1024).toFixed(1)} KB)`)

  const withFlagBuf = await renderToBuffer(buildDoc(FIXTURE_WITH_FLAG))
  const withFlagPath = path.join(OUT_DIR, 'fitscore-with-flag-smoke.pdf')
  writeFileSync(withFlagPath, withFlagBuf)
  console.log(`✓  ${withFlagPath}  (${(withFlagBuf.byteLength / 1024).toFixed(1)} KB)`)

  const ldpBuf = await renderToBuffer(buildDoc(FIXTURE_LDP))
  const ldpPath = path.join(OUT_DIR, 'fitscore-ldp-smoke.pdf')
  writeFileSync(ldpPath, ldpBuf)
  console.log(`✓  ${ldpPath}  (${(ldpBuf.byteLength / 1024).toFixed(1)} KB)`)

  const multi2Buf = await renderToBuffer(buildDoc(FIXTURE_MULTI_2))
  const multi2Path = path.join(OUT_DIR, 'fitscore-multi-2-smoke.pdf')
  writeFileSync(multi2Path, multi2Buf)
  console.log(`✓  ${multi2Path}  (${(multi2Buf.byteLength / 1024).toFixed(1)} KB)`)

  const multi3Buf = await renderToBuffer(buildDoc(FIXTURE_MULTI_3))
  const multi3Path = path.join(OUT_DIR, 'fitscore-multi-3-smoke.pdf')
  writeFileSync(multi3Path, multi3Buf)
  console.log(`✓  ${multi3Path}  (${(multi3Buf.byteLength / 1024).toFixed(1)} KB)`)

  const multi4Buf = await renderToBuffer(buildDoc(FIXTURE_MULTI_4))
  const multi4Path = path.join(OUT_DIR, 'fitscore-multi-4-smoke.pdf')
  writeFileSync(multi4Path, multi4Buf)
  console.log(`✓  ${multi4Path}  (${(multi4Buf.byteLength / 1024).toFixed(1)} KB)`)

  const multi6Buf = await renderToBuffer(buildDoc(FIXTURE_MULTI_6))
  const multi6Path = path.join(OUT_DIR, 'fitscore-multi-6-smoke.pdf')
  writeFileSync(multi6Path, multi6Buf)
  console.log(`✓  ${multi6Path}  (${(multi6Buf.byteLength / 1024).toFixed(1)} KB)`)
}

main().catch((err: unknown) => { console.error(err); process.exit(1) })
