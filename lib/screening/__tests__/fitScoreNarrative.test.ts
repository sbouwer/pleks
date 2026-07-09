/**
 * lib/screening/__tests__/fitScoreNarrative.test.ts — Unit tests for the FitScore narrative engine
 *
 * Coverage:
 *   1. Schema validation  — parseToolInput accepts/rejects structured tool output
 *   2. Banned-phrase scan — findBannedPhrase catches every prohibited pattern
 *   3. Evidence anchoring — buildRequest maps engine outputs into the narrative payload
 *
 * External deps (Sentry, AI client) are stubbed so these run without network or secrets.
 */
import { describe, it, expect, vi, beforeAll } from 'vitest'

vi.mock('@sentry/nextjs', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}))

vi.mock('@/lib/ai/client', () => ({
  createMessage: vi.fn(),
}))

function omitKey(obj: Record<string, unknown>, key: string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([k]) => k !== key))
}

import {
  BANNED_PATTERNS,
  findBannedPhrase,
  parseToolInput,
  buildRequest,
  CURRENT_PROMPT_VERSION,
  type NarrativeResponse,
} from '@/lib/screening/fitScoreNarrative'
import type {
  EngineResult,
  ApplicantInput,
  ApplicantSnapshot,
} from '@/lib/screening/fitScoreEngine.v1'

// ─── Shared clean fixture ──────────────────────────────────────────────────────

const CLEAN: NarrativeResponse = {
  observedStrengths:         ['Income verified across three consecutive months.'],
  observedConcerns:          ['Bureau coverage is thin — one bureau responded.'],
  limitedVisibility:         [],
  affordabilityEvidenceLine: 'Rent 28% of verified joint income.',
  stabilityEvidenceLine:     '2 verified rental references on record.',
  creditEvidenceLine:        'TransUnion 710 Delphi score.',
  verificationEvidenceLine:  '5 of 5 checks passed.',
  affordabilityObservations: ['Rent 28% of verified joint income.', 'No debt servicing data present.', 'Disposable income not computed for this lease.'],
  stabilityObservations:     ['Two rental references verified on record.', 'Employment tenure not recorded for this applicant.', 'Address history gap: no move data supplied.'],
  creditObservations:        ['TransUnion responded; no adverse listings recorded.', 'One bureau responded for this applicant.', 'No bureau divergence detected.'],
  verificationObservations:  ['5 of 5 checks passed.', 'Identity match passed as foundational signal.', 'No outstanding verification gaps noted.'],
  ldpSummary:                null,
  isTemplated:               false,
  failureReason:             null,
}

// ─── 1. Schema validation (parseToolInput) ────────────────────────────────────

describe('parseToolInput', () => {
  const base = {
    observed_strengths:         ['Income verified.'],
    observed_concerns:          [],
    limited_visibility:         [],
    affordability_evidence_line: 'Rent 28% of verified income.',
    stability_evidence_line:    '3 rental references verified.',
    verification_evidence_line: '5 of 5 checks passed.',
    affordability_observations: ['Rent 28% of verified income.', 'No debt data present.', 'Disposable income not computed.'],
    stability_observations:     ['3 rental references verified.', 'Employment tenure not recorded.', 'Address history gap noted.'],
    verification_observations:  ['5 of 5 checks passed.', 'Identity match foundational.', 'No outstanding gaps noted.'],
  }

  it('accepts valid minimal input and sets isTemplated=false', () => {
    const r = parseToolInput(base)
    expect(r).not.toBeNull()
    expect(r!.isTemplated).toBe(false)
    expect(r!.failureReason).toBeNull()
  })

  it('maps snake_case fields to camelCase output', () => {
    const r = parseToolInput(base)
    expect(r!.affordabilityEvidenceLine).toBe('Rent 28% of verified income.')
    expect(r!.stabilityEvidenceLine).toBe('3 rental references verified.')
    expect(r!.verificationEvidenceLine).toBe('5 of 5 checks passed.')
    expect(r!.observedStrengths).toEqual(['Income verified.'])
  })

  it('maps credit_evidence_line string', () => {
    const r = parseToolInput({ ...base, credit_evidence_line: 'TransUnion 710 Delphi.' })
    expect(r!.creditEvidenceLine).toBe('TransUnion 710 Delphi.')
  })

  it('maps credit_evidence_line null (foreign-national lease)', () => {
    const r = parseToolInput({ ...base, credit_evidence_line: null })
    expect(r!.creditEvidenceLine).toBeNull()
  })

  it('maps ldp_summary when present', () => {
    const r = parseToolInput({ ...base, ldp_summary: 'Insufficient income signals.' })
    expect(r!.ldpSummary).toBe('Insufficient income signals.')
  })

  it('returns null when observed_strengths is missing', () => {
    expect(parseToolInput(omitKey(base, 'observed_strengths'))).toBeNull()
  })

  it('returns null when affordability_evidence_line is missing', () => {
    expect(parseToolInput(omitKey(base, 'affordability_evidence_line'))).toBeNull()
  })

  it('returns null when stability_evidence_line is missing', () => {
    expect(parseToolInput(omitKey(base, 'stability_evidence_line'))).toBeNull()
  })

  it('returns null when verification_evidence_line is missing', () => {
    expect(parseToolInput(omitKey(base, 'verification_evidence_line'))).toBeNull()
  })

  it('returns null when arrays are replaced by strings', () => {
    expect(parseToolInput({ ...base, observed_strengths: 'not an array' })).toBeNull()
    expect(parseToolInput({ ...base, observed_concerns: 'not an array' })).toBeNull()
    expect(parseToolInput({ ...base, limited_visibility: 42 })).toBeNull()
  })

  it('returns null for non-object input', () => {
    expect(parseToolInput(null)).toBeNull()
    expect(parseToolInput(undefined)).toBeNull()
    expect(parseToolInput('string')).toBeNull()
    expect(parseToolInput(42)).toBeNull()
  })

  it('filters non-string items from bullet arrays', () => {
    const r = parseToolInput({ ...base, observed_strengths: ['Good', 42, null, 'Strong'] })
    expect(r!.observedStrengths).toEqual(['Good', 'Strong'])
  })
})

// ─── 2. Banned-phrase scan (findBannedPhrase) ─────────────────────────────────

describe('findBannedPhrase', () => {
  it('returns null for a clean narrative', () => {
    expect(findBannedPhrase(CLEAN)).toBeNull()
  })

  const CASES: [string, string][] = [
    ['recommend',           'We recommend this applicant.'],
    ['recommended',         'Income is recommended for review.'],
    ['advise',              'We advise the agent to proceed.'],
    ['advisable',           'It is advisable to proceed.'],
    ['approve',             'The application should be approved.'],
    ['approval',            'Approval is warranted.'],
    ['accept',              'The application was accepted.'],
    ['reject',              'The application was rejected.'],
    ['decline',             'The lease was declined.'],
    ['qualify',             'The applicant does not qualify.'],
    ['disqualify',          'Income levels disqualify this applicant.'],
    ['unqualified',         'The applicant is unqualified.'],
    ['ready to lease',      'The applicant is ready to lease.'],
    ['not ready to lease',  'The applicant is not ready to lease.'],
    ['the agent should',    'The agent should proceed with caution.'],
    ['the landlord should', 'The landlord should request guarantees.'],
    ['manual review recommended', 'Manual review recommended.'],
    ['required to',         'The applicant is required to provide docs.'],
    ['needs to',            'The applicant needs to supply proof.'],
    ['has to',              'The agent has to decide.'],
    ['good tenant',         'This is a good tenant overall.'],
    ['bad tenant',          'A bad tenant history is evident.'],
    ['strong applicant',    'This is a strong applicant.'],
    ['weak applicant',      'Appears to be a weak applicant.'],
    ['risky',               'This application is risky.'],
    ['trustworthy',         'The applicant is trustworthy.'],
    ['untrustworthy',       'The applicant appears untrustworthy.'],
    ['track record of',     'Has a track record of non-payment.'],
    ['likely to pay',       'The applicant is likely to pay on time.'],
    ['likely to default',   'The applicant is likely to default.'],
    ['will pay',            'The applicant will pay rent on time.'],
    ['predict',             'We predict no defaults.'],
    ['forecast',            'Income forecast is stable.'],
    ['appears to',          'Income appears to be consistent.'],
    ['seems to',            'The applicant seems to be stable.'],
    ['may have',            'The applicant may have cash income.'],
    ['reliable',            'The applicant is reliable.'],
    ['unreliable',          'Income is unreliable.'],
    ['could be',            'This could be a risk.'],
  ]

  for (const [label, phrase] of CASES) {
    it(`detects: ${label}`, () => {
      expect(findBannedPhrase({ ...CLEAN, affordabilityEvidenceLine: phrase })).not.toBeNull()
    })
  }

  it('detects phrase in observedStrengths', () => {
    expect(findBannedPhrase({ ...CLEAN, observedStrengths: ['We recommend this application.'] })).not.toBeNull()
  })

  it('detects phrase in observedConcerns', () => {
    expect(findBannedPhrase({ ...CLEAN, observedConcerns: ['Application should be rejected.'] })).not.toBeNull()
  })

  it('detects phrase in limitedVisibility', () => {
    expect(findBannedPhrase({ ...CLEAN, limitedVisibility: ['Credit data is unreliable.'] })).not.toBeNull()
  })

  it('detects phrase in ldpSummary', () => {
    expect(findBannedPhrase({ ...CLEAN, ldpSummary: 'We recommend additional documentation.' })).not.toBeNull()
  })

  it('is case-insensitive', () => {
    expect(findBannedPhrase({ ...CLEAN, affordabilityEvidenceLine: 'RECOMMEND approval.' })).not.toBeNull()
    expect(findBannedPhrase({ ...CLEAN, affordabilityEvidenceLine: 'Income Is RELIABLE.' })).not.toBeNull()
  })

  it('respects word boundary — "acceptable" does not match "accept"', () => {
    expect(findBannedPhrase({ ...CLEAN, affordabilityEvidenceLine: 'Income is at an acceptable level.' })).toBeNull()
  })

  it('respects word boundary — "accepted" is banned', () => {
    expect(findBannedPhrase({ ...CLEAN, affordabilityEvidenceLine: 'Terms accepted.' })).not.toBeNull()
  })

  it('respects word boundary — "prediction" is banned', () => {
    expect(findBannedPhrase({ ...CLEAN, affordabilityEvidenceLine: 'No prediction of default.' })).not.toBeNull()
  })
})

describe('BANNED_PATTERNS', () => {
  it('contains at least 40 patterns', () => {
    expect(BANNED_PATTERNS.length).toBeGreaterThanOrEqual(40)
  })

  it('every entry is a RegExp', () => {
    for (const p of BANNED_PATTERNS) {
      expect(p).toBeInstanceOf(RegExp)
    }
  })
})

// ─── 3. Evidence anchoring (buildRequest) ─────────────────────────────────────

const BASE_APPLICANT: ApplicantInput = {
  id:               'app-a',
  label:            'Applicant A',
  nationalityType:  'sa_citizen',
  tier1IncomeCents: null,
  tier2IncomeCents: null,
  tier3IncomeCents: 4500000,
  tier4IncomeCents: 5000000,
  bureauScores:     [],           // no XDS → totalDebtCents = 0
  identityMatchStatus:          'pass',
  employerConsistencyStatus:    'pass',
  salaryReconciliationStatus:   'pass',
  documentConsistencyStatus:    'pass',
  bankOwnershipStatus:          'pass',
  secondaryReferencePresent:    false,
  employmentTenureMonths:       null,
  addressMoves36Months:         null,
  bankAccountLongevityMonths:   null,
  salaryDepositConsistencyMonths: null,
  verifiedRentalReferences:     2,
  pleksNetworkStatus:           'none',
  pleksNetworkTenancyCount:     0,
}

const BASE_SNAP: ApplicantSnapshot = {
  id:                       'app-a',
  label:                    'Applicant A',
  nationalityType:          'sa_citizen',
  isForeignNational:        false,
  incomeTier:               3,
  verifiedIncomeCents:      4500000,
  incomeSharePct:           100,
  verificationIntegrityScore: 85,
  verificationIntegrityGrade: 'high',
  incomeVarianceViGradeDelta: 0,
  viAdjustmentsApplied:     [],
  bureauProcessing: {
    responding:          ['transunion'],
    outliers:            [],
    coverageWeights:     { transunion: 1 },
    delphiScores:        { transunion: 710 },
    weightedMedianDelphi: 710,
    dimensionalScore:    80,
    adverseAdjustment:   0,
    divergenceDetected:  false,
  },
  stabilityScore:       75,
  stabilitySignalCount: 2,
  compositeWeighted:    78,
  compositeWeights:     { affordability: 0.35, stability: 0.25, creditBehaviour: 0.2, verificationIntegrity: 0.2 },
  flagsDetected:        [],
}

const BASE_RESULT: EngineResult = {
  score:                78,
  band:                 'cautious_review',
  confidenceIndex:      'medium',
  verificationIntegrity: 'high',
  materialFlags:        [],
  components: {
    affordability:        70,
    stability:            75,
    creditBehaviour:      80,
    verificationIntegrity: 85,
  },
  preferredThresholds: {
    affordability:         70,
    stability:             60,
    creditBehaviour:       65,
    verificationIntegrity: 80,
  },
  engineVersion: 'fitscore.v1.0',
  inputsHash:    'abc123',
  componentSnapshot: {
    engineVersion: 'fitscore.v1.0',
    applicants:    [BASE_SNAP],
    lease: {
      totalVerifiedIncomeCents:          4500000,
      proposedRentCents:                 1200000,
      rentToIncomeRatio:                 0.267,
      debtToIncomeRatio:                 null,
      affordabilityScore:                70,
      stabilityScore:                    75,
      creditBehaviourScore:              80,
      verificationIntegrityDimensionalScore: 85,
      leaseVerificationIntegrityGrade:   'high',
      verificationIntegrityCap:          null,
      rawComposite:                      78,
      isLimitedDataProfile:              false,
      ldpMissingSignals:                 [],
      confidenceGrade:                   'medium',
      confidenceReductions:              [],
      hardFlagsApplied:                  [],
      bandBeforeCaps:                    'cautious_review',
      finalBand:                         'cautious_review',
    },
  },
}

describe('buildRequest — evidence anchoring', () => {
  let payload: Record<string, unknown>

  beforeAll(() => {
    payload = JSON.parse(buildRequest(BASE_RESULT, [BASE_APPLICANT])) as Record<string, unknown>
  })

  it('includes engine band verbatim', () => {
    expect(payload.band).toBe('cautious_review')
  })

  it('includes composite_score from engine', () => {
    expect(payload.composite_score).toBe(78)
  })

  it('includes prompt_version', () => {
    expect(payload.prompt_version).toBe(CURRENT_PROMPT_VERSION)
  })

  it('includes all dimensional scores from engine components', () => {
    const ds = payload.dimensional_scores as Record<string, unknown>
    expect(ds.affordability).toBe(70)
    expect(ds.stability).toBe(75)
    expect(ds.credit_behaviour).toBe(80)
    expect(ds.verification_integrity).toBe(85)
  })

  it('includes rent_to_income_pct derived from engine snapshot', () => {
    const aff = payload.affordability_signals as Record<string, unknown>
    expect(aff.rent_to_income_pct).toBe(27) // Math.round(0.267 * 100)
  })

  it('omits debt_servicing_pct when no XDS instalment data (totalDebtCents = 0)', () => {
    const aff = payload.affordability_signals as Record<string, unknown>
    expect(aff).not.toHaveProperty('debt_servicing_pct')
  })

  it('includes debt_servicing_pct when XDS has instalment data', () => {
    const withXds: ApplicantInput = {
      ...BASE_APPLICANT,
      bureauScores: [{
        bureau:               'xds',
        delphiScore:          null,
        coverageMonths:       12,
        hasAdverseListings:   false,
        adverseListingCount:  0,
        writtenOffCount:      0,
        monthlyInstalmentCents: 80000,
        hasSAFPS:             false,
        hasDebtReview:        false,
        hasActiveJudgment:    false,
        judgmentAgeMonths:    null,
        idReissueAgeMonths:   null,
      }],
    }
    const p = JSON.parse(buildRequest(BASE_RESULT, [withXds])) as Record<string, unknown>
    const aff = p.affordability_signals as Record<string, unknown>
    expect(aff).toHaveProperty('debt_servicing_pct')
    expect(typeof aff.debt_servicing_pct).toBe('number')
  })

  it('sets credit_behaviour null for foreign-national-only lease', () => {
    const foreignApp: ApplicantInput = { ...BASE_APPLICANT, nationalityType: 'foreign_work_permit' }
    const p = JSON.parse(buildRequest(BASE_RESULT, [foreignApp])) as Record<string, unknown>
    const ds = p.dimensional_scores as Record<string, unknown>
    expect(ds.credit_behaviour).toBeNull()
  })

  it('does not include address_continuity_grade (F2 — field not yet collected)', () => {
    const stability = payload.stability_signals as Record<string, unknown>
    expect(stability).not.toHaveProperty('address_continuity_grade')
  })

  it('includes rental_references_verified from applicant input', () => {
    const stability = payload.stability_signals as Record<string, unknown>
    expect(stability.rental_references_verified).toBe(2)
  })

  it('includes lease_composition counts', () => {
    const comp = payload.lease_composition as Record<string, unknown>
    expect(comp.applicant_count).toBe(1)
    expect(comp.sa_citizen_count).toBe(1)
    expect(comp.foreign_national_count).toBe(0)
  })

  it('classifies foreign national correctly in lease_composition', () => {
    const foreignApp: ApplicantInput = { ...BASE_APPLICANT, nationalityType: 'foreign_work_permit' }
    const p = JSON.parse(buildRequest(BASE_RESULT, [foreignApp])) as Record<string, unknown>
    const comp = p.lease_composition as Record<string, unknown>
    expect(comp.sa_citizen_count).toBe(0)
    expect(comp.foreign_national_count).toBe(1)
  })

  it('includes material_flags array', () => {
    expect(Array.isArray(payload.material_flags)).toBe(true)
  })
})
