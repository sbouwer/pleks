/**
 * lib/screening/__tests__/fitScoreReplay.test.ts — Unit tests for runFitScoreReplay
 *
 * Auth:   n/a (test file)
 * Data:   mocked createServiceClient — no real DB access
 * Notes:  Tests match, mismatch, and incomplete_data integrity outcomes.
 *         Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §8.8–§8.12.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: vi.fn(),
}))

vi.mock('@/lib/screening/fitScoreEngine.v1', () => ({
  ENGINE_VERSION: 'fitscore.v1.0.1',
}))

import { createServiceClient } from '@/lib/supabase/server'
import { runFitScoreReplay } from '../fitScoreReplay'
import type { ComponentSnapshot } from '@/lib/screening/fitScoreEngine.v1'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TEST_APP_ID = 'aaaaaaaa-0000-0000-0000-000000000001'
const TEST_ORG_ID = 'bbbbbbbb-0000-0000-0000-000000000002'

const baseSnap: ComponentSnapshot = {
  engineVersion: 'fitscore.v1.0.1',
  applicants: [],
  lease: {
    totalVerifiedIncomeCents:              5_000_000,
    proposedRentCents:                     1_200_000,
    rentToIncomeRatio:                     0.24,
    affordabilityScore:                    0.8,
    stabilityScore:                        0.7,
    creditBehaviourScore:                  0.75,
    verificationIntegrityDimensionalScore: 0.9,
    leaseVerificationIntegrityGrade:       'high',
    verificationIntegrityCap:              null,
    rawComposite:                          78,
    isLimitedDataProfile:                  false,
    ldpMissingSignals:                     [],
    confidenceGrade:                       'high',
    confidenceReductions:                  [],
    hardFlagsApplied:                      [],
    bandBeforeCaps:                        'stable_profile',
    finalBand:                             'stable_profile',
  },
}

const baseComponents = {
  affordability:         0.8,
  stability:             0.7,
  creditBehaviour:       0.75,
  verificationIntegrity: 0.9,
}

function makeChain(data: unknown, error: unknown = null) {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq:     () => chain,
    single: () => Promise.resolve({ data, error }),
  }
  return chain
}

function makeDb(appData: unknown, appError: unknown = null): SupabaseClient<never> {
  return { from: () => makeChain(appData, appError) } as unknown as SupabaseClient<never>
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('runFitScoreReplay', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('returns integrityStatus=match when band and dimensions agree with snapshot', async () => {
    vi.mocked(createServiceClient).mockResolvedValue(makeDb({
      id:                               TEST_APP_ID,
      org_id:                           TEST_ORG_ID,
      fitscore_band:                    'stable_profile',
      fitscore_components:              baseComponents,
      fitscore_component_snapshot:      baseSnap,
      fitscore_engine_version:          'fitscore.v1.0.1',
      fitscore_inputs_hash:             'abc123',
      fitscore_narrative_prompt_version: 'narr.v1.0',
      fitscore_computed_at:             '2026-04-01T10:00:00Z',
      fitscore_runtime_code_hash:       null,
    }))

    const report = await runFitScoreReplay(TEST_APP_ID, TEST_ORG_ID)

    expect(report.integrityStatus).toBe('match')
    expect(report.mismatches).toHaveLength(0)
    expect(report.bandMatch).toBe(true)
    expect(report.bandStored).toBe('stable_profile')
    expect(report.bandFromSnapshot).toBe('stable_profile')
    expect(report.inputsHashVerified).toBe(true)
    expect(report.dimensionComparison?.match).toBe(true)
  })

  it('returns integrityStatus=mismatch when stored band differs from snapshot band', async () => {
    vi.mocked(createServiceClient).mockResolvedValue(makeDb({
      id:                               TEST_APP_ID,
      org_id:                           TEST_ORG_ID,
      fitscore_band:                    'cautious_review',   // mutated — snapshot says stable_profile
      fitscore_components:              baseComponents,
      fitscore_component_snapshot:      baseSnap,
      fitscore_engine_version:          'fitscore.v1.0.1',
      fitscore_inputs_hash:             'abc123',
      fitscore_narrative_prompt_version: 'narr.v1.0',
      fitscore_computed_at:             '2026-04-01T10:00:00Z',
      fitscore_runtime_code_hash:       null,
    }))

    const report = await runFitScoreReplay(TEST_APP_ID, TEST_ORG_ID)

    expect(report.integrityStatus).toBe('mismatch')
    expect(report.bandMatch).toBe(false)
    expect(report.mismatches.length).toBeGreaterThan(0)
    expect(report.mismatches.some(m => m.includes('Band mismatch'))).toBe(true)
  })

  it('returns integrityStatus=mismatch when dimension scores differ from snapshot', async () => {
    const mutatedComponents = {
      affordability:         0.5,   // tampered — snapshot has 0.8
      stability:             0.7,
      creditBehaviour:       0.75,
      verificationIntegrity: 0.9,
    }

    vi.mocked(createServiceClient).mockResolvedValue(makeDb({
      id:                               TEST_APP_ID,
      org_id:                           TEST_ORG_ID,
      fitscore_band:                    'stable_profile',
      fitscore_components:              mutatedComponents,
      fitscore_component_snapshot:      baseSnap,
      fitscore_engine_version:          'fitscore.v1.0.1',
      fitscore_inputs_hash:             'abc123',
      fitscore_narrative_prompt_version: 'narr.v1.0',
      fitscore_computed_at:             '2026-04-01T10:00:00Z',
      fitscore_runtime_code_hash:       null,
    }))

    const report = await runFitScoreReplay(TEST_APP_ID, TEST_ORG_ID)

    expect(report.integrityStatus).toBe('mismatch')
    expect(report.mismatches.some(m => m.includes('Dimension score mismatch'))).toBe(true)
    expect(report.dimensionComparison?.match).toBe(false)
  })

  it('returns integrityStatus=incomplete_data when fitscore_component_snapshot is null', async () => {
    vi.mocked(createServiceClient).mockResolvedValue(makeDb({
      id:                               TEST_APP_ID,
      org_id:                           TEST_ORG_ID,
      fitscore_band:                    'stable_profile',
      fitscore_components:              baseComponents,
      fitscore_component_snapshot:      null,
      fitscore_engine_version:          'fitscore.v1.0.1',
      fitscore_inputs_hash:             'abc123',
      fitscore_narrative_prompt_version: null,
      fitscore_computed_at:             null,
      fitscore_runtime_code_hash:       null,
    }))

    const report = await runFitScoreReplay(TEST_APP_ID, TEST_ORG_ID)

    expect(report.integrityStatus).toBe('incomplete_data')
    expect(report.bandFromSnapshot).toBeNull()
    expect(report.dimensionComparison).toBeNull()
    expect(report.mismatches.length).toBeGreaterThan(0)
  })
})
