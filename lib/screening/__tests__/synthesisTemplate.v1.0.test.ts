/**
 * lib/screening/__tests__/synthesisTemplate.v1.0.test.ts — Unit tests for synthesis paragraph template
 *
 * Coverage:
 *   1. Version constant exported at 'synthesis.v1.0'
 *   2. Standard branch — all-surplus (spec acceptance string)
 *   3. Standard branch — one dimension in deficit (3 of 4)
 *   4. Standard branch — all-foreign-national (3 populated dimensions, M=3)
 *   5. Standard branch — all below threshold (N=0, uses "None of the M applicable")
 *   6. LDP branch — isLdp produces no-score output
 *   7. Blocked branch — plural critical flags
 *   8. Blocked branch — singular critical flag
 */

import { describe, it, expect } from 'vitest'
import { buildSynthesis, SYNTHESIS_TEMPLATE_VERSION } from '@/lib/screening/prompts/synthesisTemplate.v1.0'
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
  synthesisVersion:      'synthesis.v1.0',
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

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe('SYNTHESIS_TEMPLATE_VERSION', () => {
  it('exports the expected version string', () => {
    expect(SYNTHESIS_TEMPLATE_VERSION).toBe('synthesis.v1.0')
  })
})

describe('buildSynthesis — standard branch', () => {
  it('produces the spec acceptance string when all 4 dimensions are surplus', () => {
    const result = buildSynthesis(BASE)
    expect(result).toBe(
      'Stable Profile - composite 82. ' +
      '4 of 4 dimensions met or exceeded their preferred threshold. ' +
      'Band placement confidence: high. ' +
      'Final tenancy decisions rest with the agent or landlord.',
    )
  })

  it('reflects 3 of 4 when one dimension is in deficit', () => {
    const data: FitScoreReportData = {
      ...BASE,
      dimensionalScores: {
        ...BASE.dimensionalScores,
        creditBehaviour: 55, // below threshold 65
      },
    }
    expect(buildSynthesis(data)).toContain('3 of 4 dimensions met or exceeded')
  })

  it('counts only 3 populated dimensions for an all-foreign-national lease', () => {
    const data: FitScoreReportData = {
      ...BASE,
      isAllForeignNational: true,
      dimensionalScores: {
        ...BASE.dimensionalScores,
        creditBehaviour:                       null,
        creditBehaviour_preferred_threshold:   null,
        // affordability, stability, verificationIntegrity all above threshold
        affordability:    84,
        stability:        78,
        verificationIntegrity: 92,
      },
    }
    const result = buildSynthesis(data)
    expect(result).toContain('3 of 3 dimensions met or exceeded')
  })

  it('uses "None of the M applicable" phrasing when N=0', () => {
    const data: FitScoreReportData = {
      ...BASE,
      dimensionalScores: {
        affordability:                             20, // below 70
        stability:                                 10, // below 60
        creditBehaviour:                           30, // below 65
        verificationIntegrity:                     40, // below 80
        affordability_preferred_threshold:         70,
        stability_preferred_threshold:             60,
        creditBehaviour_preferred_threshold:       65,
        verificationIntegrity_preferred_threshold: 80,
      },
    }
    expect(buildSynthesis(data)).toContain('None of the 4 applicable dimensions')
  })

  it('includes band label, score, confidence and closing disclaimer', () => {
    const result = buildSynthesis(BASE)
    expect(result).toContain('Stable Profile')
    expect(result).toContain('composite 82')
    expect(result).toContain('Band placement confidence: high')
    expect(result).toContain('Final tenancy decisions rest with the agent or landlord.')
  })
})

describe('buildSynthesis — LDP branch', () => {
  it('returns the no-score LDP paragraph', () => {
    const data: FitScoreReportData = { ...BASE, isLdp: true, band: 'limited_data_profile', score: null }
    const result = buildSynthesis(data)
    expect(result).toContain('Pleks did not produce a composite score')
    expect(result).toContain('Manual review by the agent is required.')
    expect(result).toContain('Final tenancy decisions rest with the agent or landlord.')
    expect(result).not.toContain('composite null')
  })
})

describe('buildSynthesis — blocked branch', () => {
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

  it('references section 1 for material flags', () => {
    const data: FitScoreReportData = {
      ...BASE,
      band: 'blocked',
      score: null,
      materialFlags: [
        { flag: 'a', class: 'critical', description: '', source: '', capApplied: false, capCeiling: null, applicantId: null, applicantLabel: null, observedAt: '2026-05-22T10:00:00Z' },
      ],
    }
    expect(buildSynthesis(data)).toContain('section 1')
  })
})
