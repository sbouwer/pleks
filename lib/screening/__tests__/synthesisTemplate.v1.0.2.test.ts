/**
 * lib/screening/__tests__/synthesisTemplate.v1.0.2.test.ts — Unit tests for synthesis paragraph template v1.0.2
 *
 * Coverage:
 *   1.  Version constant exported at 'synthesis.v1.0.2'
 *   2.  LDP branch — N=4 (all dimensions populated) produces correct text with em-dash
 *   3.  LDP branch — N=3 (creditBehaviour null) counts correctly
 *   4.  LDP branch — does not contain 'composite null' or scored-band text
 *   5.  Standard branch — all-surplus (4 of 4)
 *   6.  Standard branch — one dimension in deficit (3 of 4)
 *   7.  Standard branch — all-foreign-national (creditBehaviour null; 3 of 3)
 *   8.  Standard branch — all below threshold (N=0, uses "None of the M applicable")
 *   9.  Standard branch — singular critical flag
 *   10. Standard branch — plural critical flags
 *   11. Blocked branch — singular critical flag
 *   12. Blocked branch — plural critical flags
 *   13. Blocked branch — references "Material flags card" not "section 1"
 */

import { describe, it, expect } from 'vitest'
import { buildSynthesis, SYNTHESIS_TEMPLATE_VERSION } from '@/lib/screening/prompts/synthesisTemplate.v1.0.2'
import type { FitScoreReportData } from '@/lib/reports/screening/_primitives/theme'

// ─── Minimal base fixture ──────────────────────────────────────────────────────

const BASE: FitScoreReportData = {
  applicationRef:       'PLK-TEST-001',
  unitLabel:            '2-bedroom apartment, Sea Point',
  generatedAt:          '2026-05-22T10:00:00Z',
  submittedAt:          '2026-05-19T09:00:00Z',
  primaryApplicantName: 'Test Applicant',
  coApplicantCount:     0,
  applicants: [],
  leaseIntent: { termMonths: 12, monthlyRentCents: 1200000, depositMultiplier: 2 },
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
  materialFlags:        [],
  isLdp:                false,
  isAllForeignNational: false,
  narrative: {
    observedStrengths:           [],
    observedConcerns:            [],
    limitedVisibility:           [],
    affordabilityEvidenceLine:   '',
    stabilityEvidenceLine:       '',
    creditEvidenceLine:          '',
    verificationEvidenceLine:    '',
    affordabilityObservations:   [],
    stabilityObservations:       [],
    creditObservations:          [],
    verificationObservations:    [],
    ldpSummary:                  null,
    isTemplated:                 false,
    failureReason:               null,
  },
  engineVersion:         'fitscore.v1.0.1',
  narrativeVersion:      'narr.v1.1',
  interpretationVersion: 'interpretation.v1.0',
  synthesisVersion:      'synthesis.v1.0.2',
  inputsHash:            'a'.repeat(64),
  orgName:               'Test Agency',
  orgFfcNumber:          null,
  dimensions: {
    affordability: { rentToIncomePct: 32, windowMonths: 6 },
    stability:     { currentTenureDisplay: '3y 2mo', employersIn7Years: 2 },
    credit:        { bureauCoverageDisplay: '2 / 3', divergencePoints: null },
    verification:  { checksPassedDisplay: '5 / 5', manualOverridesPending: 0, auditEntriesCount: 5 },
  },
}

const CRITICAL_FLAG: FitScoreReportData['materialFlags'][0] = {
  flag: 'critical_test', class: 'critical', description: 'Critical signal', source: '',
  capApplied: false, capCeiling: null, applicantId: null, applicantLabel: null,
  observedAt: '2026-05-22T10:00:00Z',
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('SYNTHESIS_TEMPLATE_VERSION', () => {
  it('exports the expected version string', () => {
    expect(SYNTHESIS_TEMPLATE_VERSION).toBe('synthesis.v1.0.2')
  })
})

describe('buildSynthesis — LDP branch', () => {
  it('produces the correct LDP paragraph with em-dash when all 4 dimensions are populated', () => {
    const data: FitScoreReportData = {
      ...BASE,
      isLdp: true,
      band: 'limited_data_profile',
      score: null,
    }
    expect(buildSynthesis(data)).toBe(
      'Limited Data Profile — composite not positioned. ' +
      '4 of 4 dimensions had scoreable evidence available. ' +
      'Band placement requires evidence across all four primary dimensions. ' +
      'Final tenancy decisions rest with the agent or landlord.',
    )
  })

  it('counts 3 populated dimensions when creditBehaviour is null', () => {
    const data: FitScoreReportData = {
      ...BASE,
      isLdp: true,
      band: 'limited_data_profile',
      score: null,
      dimensionalScores: {
        ...BASE.dimensionalScores,
        creditBehaviour:                     null,
        creditBehaviour_preferred_threshold: null,
      },
    }
    expect(buildSynthesis(data)).toContain('3 of 4 dimensions had scoreable evidence available.')
  })

  it('does not contain "composite null" or scored-band phrasing', () => {
    const data: FitScoreReportData = {
      ...BASE,
      isLdp: true,
      band: 'limited_data_profile',
      score: null,
    }
    const result = buildSynthesis(data)
    expect(result).not.toContain('composite null')
    expect(result).not.toContain('Stable Profile')
    expect(result).not.toContain('Band placement confidence')
  })
})

describe('buildSynthesis — standard branch', () => {
  it('produces the spec acceptance string when all 4 dimensions are surplus', () => {
    const result = buildSynthesis(BASE)
    expect(result).toBe(
      'Stable Profile — composite 82. ' +
      '4 of 4 dimensions met or exceeded their preferred threshold. ' +
      'Band placement confidence: high. ' +
      'Final tenancy decisions rest with the agent or landlord.',
    )
  })

  it('reflects 3 of 4 when one dimension is in deficit', () => {
    const data: FitScoreReportData = {
      ...BASE,
      dimensionalScores: { ...BASE.dimensionalScores, creditBehaviour: 55 },
    }
    expect(buildSynthesis(data)).toContain('3 of 4 dimensions met or exceeded')
  })

  it('counts only 3 populated dimensions for an all-foreign-national lease', () => {
    const data: FitScoreReportData = {
      ...BASE,
      isAllForeignNational: true,
      dimensionalScores: {
        ...BASE.dimensionalScores,
        creditBehaviour:                     null,
        creditBehaviour_preferred_threshold: null,
      },
    }
    expect(buildSynthesis(data)).toContain('3 of 3 dimensions met or exceeded')
  })

  it('uses "None of the M applicable" phrasing when N=0', () => {
    const data: FitScoreReportData = {
      ...BASE,
      dimensionalScores: {
        affordability:                             20,
        stability:                                 10,
        creditBehaviour:                           30,
        verificationIntegrity:                     40,
        affordability_preferred_threshold:         70,
        stability_preferred_threshold:             60,
        creditBehaviour_preferred_threshold:       65,
        verificationIntegrity_preferred_threshold: 80,
      },
    }
    expect(buildSynthesis(data)).toContain('None of the 4 applicable dimensions')
  })

  it('appends singular critical-flag sentence when exactly 1 critical flag present', () => {
    const data: FitScoreReportData = { ...BASE, materialFlags: [CRITICAL_FLAG] }
    const result = buildSynthesis(data)
    expect(result).toContain('One material flag (critical) observed — see the Material flags card.')
    expect(result).not.toContain('material flags (critical)')
  })

  it('appends plural critical-flag sentence when multiple critical flags present', () => {
    const data: FitScoreReportData = {
      ...BASE,
      materialFlags: [CRITICAL_FLAG, { ...CRITICAL_FLAG, flag: 'critical_test_2' }],
    }
    expect(buildSynthesis(data)).toContain('2 material flags (critical) observed — see the Material flags card.')
  })
})

describe('buildSynthesis — blocked branch', () => {
  it('uses singular phrasing for exactly 1 critical flag', () => {
    const data: FitScoreReportData = {
      ...BASE,
      band: 'blocked',
      score: null,
      materialFlags: [
        { flag: 'a', class: 'critical', description: '', source: '', capApplied: false, capCeiling: null, applicantId: null, applicantLabel: null, observedAt: '2026-05-22T10:00:00Z' },
      ],
    }
    expect(buildSynthesis(data)).toContain('1 critical flag prevents composite assessment')
  })

  it('uses plural phrasing for 2 critical flags', () => {
    const data: FitScoreReportData = {
      ...BASE,
      band: 'blocked',
      score: null,
      materialFlags: [
        { flag: 'a', class: 'critical', description: '', source: '', capApplied: false, capCeiling: null, applicantId: null, applicantLabel: null, observedAt: '2026-05-22T10:00:00Z' },
        { flag: 'b', class: 'critical', description: '', source: '', capApplied: false, capCeiling: null, applicantId: null, applicantLabel: null, observedAt: '2026-05-22T10:00:00Z' },
      ],
    }
    expect(buildSynthesis(data)).toContain('2 critical flags prevent composite assessment')
  })

  it('references the Material flags card, not section 1', () => {
    const data: FitScoreReportData = {
      ...BASE,
      band: 'blocked',
      score: null,
      materialFlags: [
        { flag: 'a', class: 'critical', description: '', source: '', capApplied: false, capCeiling: null, applicantId: null, applicantLabel: null, observedAt: '2026-05-22T10:00:00Z' },
      ],
    }
    const result = buildSynthesis(data)
    expect(result).toContain('Material flags card')
    expect(result).not.toContain('section 1')
  })
})
