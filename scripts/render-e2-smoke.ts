/**
 * scripts/render-e2-smoke.ts — E.2 + E.3 smoke render (skeleton + populated)
 *
 * Run:    npm run fitscore:render-e2-smoke
 * Output: lib/reports/screening/_pdf/__samples__/e2-e3-skeleton.pdf
 *         lib/reports/screening/_pdf/__samples__/e2-e3-populated.pdf
 *
 * Two fixtures, two PDFs:
 *   skeleton   — creditAnalysis absent; exercises all PENDING placeholder states in E.3.
 *   populated  — creditAnalysis present (3 bureaus, 5 checks, 1 absent); exercises full
 *                render paths in BureauCoverageMatrix + VerificationCheckTable.
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
import { FlagPillRow }            from "@/lib/reports/screening/_pdf/primitives/FlagPillRow"
import { DimensionCardEditorial } from "@/lib/reports/screening/_pdf/primitives/DimensionCardEditorial"

import { IncomeReconciliationTable } from "@/lib/reports/screening/_pdf/primitives/IncomeReconciliationTable"
import { ExpenditureTable }          from "@/lib/reports/screening/_pdf/primitives/ExpenditureTable"
import { RiskUncertaintySplit }      from "@/lib/reports/screening/_pdf/primitives/RiskUncertaintySplit"
import { BureauCoverageMatrix }      from "@/lib/reports/screening/_pdf/primitives/BureauCoverageMatrix"
import { VerificationCheckTable }    from "@/lib/reports/screening/_pdf/primitives/VerificationCheckTable"

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

// ─── Credit analysis fixture (populated variant only) ─────────────────────────

const CREDIT_ANALYSIS: FitScoreCreditAnalysis = {
  bureausResponding:     2,
  bureausSolicited:      3,
  bureauEntries: [
    {
      name:            'TransUnion',
      subLabel:        'ITC · South Africa',
      coveragePips:    5,
      coverageLabel:   'Full coverage · all trade-lines present',
      tradeLines:      '7',
      adverseListings: 'None',
      reportedScore:   712,
    },
    {
      name:            'Experian',
      subLabel:        'Delphi score · v5',
      coveragePips:    4,
      coverageLabel:   'Strong coverage · 1 trade-line absent',
      tradeLines:      '6',
      adverseListings: 'None',
      reportedScore:   688,
    },
    {
      name:            'VeriCred',
      subLabel:        'Solicited · no response',
      coveragePips:    0,
      coverageLabel:   'No response received',
      tradeLines:      '—',
      adverseListings: '—',
      reportedScore:   null,
    },
  ],
  verificationsLabel:      '5 of 5 passed',
  verificationsQueryLabel: 'queried 2026-05-19',
  verificationChecks: [
    {
      checkName:    'Identity verification',
      checkSub:     'ID number · Home Affairs match',
      source:       'DHA via Pleks',
      method:       'API · real-time',
      outcomeType:  'pass',
      outcomeLabel: '',
      evidenceNote: '',
    },
    {
      checkName:    'Income verification',
      checkSub:     'Payslip vs bureau statement',
      source:       'TransUnion · Experian',
      method:       'Bureau cross-check',
      outcomeType:  'pass',
      outcomeLabel: 'Aligned · within 8% variance',
      evidenceNote: '',
    },
    {
      checkName:    'Employment verification',
      checkSub:     'Current employer · Cape Digital Solutions',
      source:       'Pleks employment API',
      method:       'CIPC + payslip match',
      outcomeType:  'pass',
      outcomeLabel: '',
      evidenceNote: '',
    },
    {
      checkName:    'Rental reference · primary',
      checkSub:     'Prior tenancy · Pleks network record',
      source:       'Pleks network',
      method:       'On-ledger reference',
      outcomeType:  'partial',
      outcomeLabel: 'One reference verified; second not on record',
      evidenceNote: 'ref-network · 2024-09',
    },
    {
      checkName:    'Secondary employer reference',
      checkSub:     'Prior employer · not solicited',
      source:       '—',
      method:       '—',
      outcomeType:  'absent',
      outcomeLabel: '',
      evidenceNote: '',
    },
  ],
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const FIXTURE_SKELETON: FitScoreReportData  = BASE
const FIXTURE_POPULATED: FitScoreReportData = { ...BASE, creditAnalysis: CREDIT_ANALYSIS }

// ─── Document factory ─────────────────────────────────────────────────────────

function buildDoc(data: FitScoreReportData) {
  return h(Document, {},
    h(DocumentShell, { data, section: 'Profile', showAuditStrip: true },
      h(EditorialHeadline,      { data }),
      h(MetaStrip,              { data }),
      h(IdentityRow,            { data }),
      h(BandLadder,             { data }),
      h(FlagPillRow,            { data }),
      h(DimensionCardEditorial, { data }),
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
  )
}

// ─── Render ───────────────────────────────────────────────────────────────────

async function main() {
  mkdirSync(OUT_DIR, { recursive: true })

  const skeletonBuf = await renderToBuffer(buildDoc(FIXTURE_SKELETON))
  const skeletonPath = path.join(OUT_DIR, 'e2-e3-skeleton.pdf')
  writeFileSync(skeletonPath, skeletonBuf)
  console.log(`✓  ${skeletonPath}  (${(skeletonBuf.byteLength / 1024).toFixed(1)} KB)`)

  const populatedBuf = await renderToBuffer(buildDoc(FIXTURE_POPULATED))
  const populatedPath = path.join(OUT_DIR, 'e2-e3-populated.pdf')
  writeFileSync(populatedPath, populatedBuf)
  console.log(`✓  ${populatedPath}  (${(populatedBuf.byteLength / 1024).toFixed(1)} KB)`)
}

main().catch((err: unknown) => { console.error(err); process.exit(1) })
