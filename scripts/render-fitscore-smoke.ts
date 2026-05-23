/**
 * scripts/render-fitscore-smoke.ts — FitScore PDF smoke render (E.1–E.3 surface)
 *
 * Run:    npm run fitscore:render-smoke
 * Output: lib/reports/screening/_pdf/__samples__/fitscore-skeleton-smoke.pdf
 *         lib/reports/screening/_pdf/__samples__/fitscore-populated-smoke.pdf
 *
 * Three fixtures, three PDFs:
 *   skeleton   — creditAnalysis absent; exercises all PENDING placeholder states.
 *                Realistic v1 production state.
 *   populated  — creditAnalysis present (3 bureaus, 5 checks, 1 absent);
 *                exercises full render paths in BureauCoverageMatrix + VerificationCheckTable.
 *   deficit    — populated + creditBehaviour 55 (below threshold 65); exercises State B
 *                (amber-wash deficit segment) on the Credit Behaviour evidence bar.
 *
 * FITSCORE_FONT_SOURCE=local is injected by the npm script via cross-env.
 * Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §E.3 acceptance criteria.
 */

import { Document, renderToBuffer } from "@react-pdf/renderer"
import { createElement as h } from "react"
import { writeFileSync, mkdirSync } from "node:fs"
import path from "node:path"

import { DocumentShell }          from "@/lib/reports/screening/_pdf/primitives/DocumentShell"
import { EditorialHeadline }      from "@/lib/reports/screening/_pdf/primitives/EditorialHeadline"
import { MetaStrip }              from "@/lib/reports/screening/_pdf/primitives/MetaStrip"
import { IdentityRow }            from "@/lib/reports/screening/_pdf/primitives/IdentityRow"
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

// With-flag fixture: one critical material flag → exercises synthesis v1.0.1 critical-flag sentence.
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

// ─── Document factory ─────────────────────────────────────────────────────────

function buildDoc(data: FitScoreReportData) {
  return h(Document, {},
    h(DocumentShell, { data, section: 'Profile' },
      h(EditorialHeadline,      { data }),
      h(MetaStrip,              { data }),
      h(IdentityRow,            { data }),
      h(BandLadder,             { data }),
      h(DimensionCardEditorial,  { data }),
      h(DimensionReadingGuide,   {}),
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
}

main().catch((err: unknown) => { console.error(err); process.exit(1) })
