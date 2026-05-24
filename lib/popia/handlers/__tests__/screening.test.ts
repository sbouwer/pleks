/**
 * lib/popia/handlers/__tests__/screening.test.ts — Unit tests for generateScreeningL2Response
 *
 * Auth:   n/a (test file)
 * Data:   mocked createServiceClient, @react-pdf/renderer, ScreeningResponseLetter
 * Notes:  Verifies L2 scope (§8.4), audit discriminator (§8.7), identity mapping, and
 *         co-applicant exclusion. No DB or storage calls are made for real.
 *         Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §8.3–§8.7.
 */
import { vi, describe, it, expect, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('@/lib/supabase/server', () => ({
  createServiceClient: vi.fn(),
}))

vi.mock('@react-pdf/renderer', () => ({
  renderToBuffer: vi.fn(() => Promise.resolve(Buffer.from('mock-pdf'))),
}))

vi.mock('@/lib/reports/popia/screening_response', () => ({
  ScreeningResponseLetter: vi.fn(() => null),
}))

import { createServiceClient } from '@/lib/supabase/server'
import { ScreeningResponseLetter } from '@/lib/reports/popia/screening_response'
import { generateScreeningL2Response } from '../screening'
import type { ScreeningResponseData } from '@/lib/reports/popia/screening_response'
import type { MaterialFlag } from '@/lib/screening/fitScoreEngine.v1'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const TEST_APP_ID     = 'aaaaaaaa-0000-0000-0000-000000000001'
const TEST_SUBJECT_ID = 'cccccccc-0000-0000-0000-000000000003'
const TEST_ACTOR_ID   = 'dddddddd-0000-0000-0000-000000000004'
const TEST_ORG_ID     = 'bbbbbbbb-0000-0000-0000-000000000002'

const baseApp = {
  id:                              TEST_APP_ID,
  org_id:                          TEST_ORG_ID,
  first_name:                      'Thabo',
  last_name:                       'Mokoena',
  applicant_email:                 'thabo@example.com',
  fitscore:                        78,
  fitscore_band:                   'stable_profile',
  fitscore_material_flags:         [] as MaterialFlag[],
  fitscore_engine_version:         'fitscore.v1.0.1',
  fitscore_narrative_prompt_version: 'narr.v1.0',
  fitscore_interpretation_version: 'v1.0',
  fitscore_computed_at:            '2026-04-01T10:00:00Z',
  stage2_status:                   'completed',
  status:                          'pending_review',
  identityMatchStatus:             'sa_id',
}

function makeFlag(flag: string, flagClass: MaterialFlag['class'] = 'critical'): MaterialFlag {
  return {
    flag,
    class:          flagClass,
    applicantId:    TEST_APP_ID,
    applicantLabel: 'Applicant A',
    description:    `${flag} description`,
    source:         'bureau',
    capApplied:     false,
    capCeiling:     null,
    observedAt:     '2026-04-01T10:00:00Z',
  }
}

// ─── Mock DB builder ──────────────────────────────────────────────────────────

function makeChain(data: unknown, error: unknown = null) {
  const chain: Record<string, unknown> = {
    select: () => chain,
    eq:     () => chain,
    single: () => Promise.resolve({ data, error }),
  }
  return chain
}

function makeDb(
  appData: unknown,
  auditInserts: Array<Record<string, unknown>>,
): SupabaseClient<never> {
  const storageChain = {
    upload:          vi.fn(() => Promise.resolve({ error: null })),
    createSignedUrl: vi.fn(() => Promise.resolve({
      data:  { signedUrl: 'https://mock.storage/test.pdf' },
      error: null,
    })),
  }

  const db = {
    from: vi.fn((table: string) => {
      if (table === 'audit_log') {
        return {
          insert: vi.fn((row: Record<string, unknown>) => {
            auditInserts.push(row)
            return Promise.resolve({ error: null })
          }),
        }
      }
      if (table === 'popia_exports') {
        return { insert: vi.fn(() => Promise.resolve({ error: null })) }
      }
      if (table === 'organisations') {
        return makeChain({ name: 'Test Agency' })
      }
      return makeChain(appData)
    }),
    storage: { from: () => storageChain },
  }

  return db as unknown as SupabaseClient<never>
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('generateScreeningL2Response', () => {
  let capturedData: ScreeningResponseData | null = null
  let auditInserts: Array<Record<string, unknown>> = []

  beforeEach(() => {
    capturedData = null
    auditInserts = []
    vi.resetAllMocks()

    vi.mocked(ScreeningResponseLetter).mockImplementation(
      ((props: Readonly<{ data: ScreeningResponseData }>) => {
        capturedData = props.data
        return null
      }) as unknown as typeof ScreeningResponseLetter,
    )
  })

  it('sets identityVerificationResult=pass when no adverse flags', async () => {
    vi.mocked(createServiceClient).mockResolvedValue(
      makeDb({ ...baseApp, fitscore_material_flags: [] }, auditInserts),
    )

    await generateScreeningL2Response(TEST_APP_ID, TEST_SUBJECT_ID, TEST_ACTOR_ID, TEST_ORG_ID)

    expect(capturedData?.identityVerificationResult).toBe('pass')
  })

  it('sets identityVerificationResult=fail on deceased_status flag', async () => {
    vi.mocked(createServiceClient).mockResolvedValue(
      makeDb({ ...baseApp, fitscore_material_flags: [makeFlag('deceased_status')] }, auditInserts),
    )

    await generateScreeningL2Response(TEST_APP_ID, TEST_SUBJECT_ID, TEST_ACTOR_ID, TEST_ORG_ID)

    expect(capturedData?.identityVerificationResult).toBe('fail')
  })

  it('sets identityVerificationResult=fail on confirmed_fraudulent_documents flag', async () => {
    vi.mocked(createServiceClient).mockResolvedValue(
      makeDb({ ...baseApp, fitscore_material_flags: [makeFlag('confirmed_fraudulent_documents')] }, auditInserts),
    )

    await generateScreeningL2Response(TEST_APP_ID, TEST_SUBJECT_ID, TEST_ACTOR_ID, TEST_ORG_ID)

    expect(capturedData?.identityVerificationResult).toBe('fail')
  })

  it('sets identityVerificationResult=pass for capping-class flags that are not identity flags', async () => {
    vi.mocked(createServiceClient).mockResolvedValue(
      makeDb({ ...baseApp, fitscore_material_flags: [makeFlag('debt_review', 'capping')] }, auditInserts),
    )

    await generateScreeningL2Response(TEST_APP_ID, TEST_SUBJECT_ID, TEST_ACTOR_ID, TEST_ORG_ID)

    expect(capturedData?.identityVerificationResult).toBe('pass')
  })

  it('includes band and engineVersion but excludes composite/confidence in L2 data', async () => {
    vi.mocked(createServiceClient).mockResolvedValue(
      makeDb({ ...baseApp, fitscore_material_flags: [] }, auditInserts),
    )

    await generateScreeningL2Response(TEST_APP_ID, TEST_SUBJECT_ID, TEST_ACTOR_ID, TEST_ORG_ID)

    expect(capturedData?.band).toBe('stable_profile')
    expect(capturedData?.engineVersion).toBe('fitscore.v1.0.1')
    expect(capturedData?.score).toBe(78)
    expect(capturedData).not.toHaveProperty('confidenceIndex')
    expect(capturedData).not.toHaveProperty('confidenceGrade')
  })

  it('writes audit_log with popia_s23_response_generated discriminator', async () => {
    vi.mocked(createServiceClient).mockResolvedValue(
      makeDb({ ...baseApp, fitscore_material_flags: [] }, auditInserts),
    )

    await generateScreeningL2Response(TEST_APP_ID, TEST_SUBJECT_ID, TEST_ACTOR_ID, TEST_ORG_ID)

    expect(auditInserts).toHaveLength(1)
    const auditRow = auditInserts[0] as { new_values: Record<string, unknown> }
    expect(auditRow.new_values?.action).toBe('popia_s23_response_generated')
  })

  it('does not query application_co_applicants (co-applicant data excluded per §8.5)', async () => {
    const db = makeDb({ ...baseApp, fitscore_material_flags: [] }, auditInserts)
    vi.mocked(createServiceClient).mockResolvedValue(db)

    await generateScreeningL2Response(TEST_APP_ID, TEST_SUBJECT_ID, TEST_ACTOR_ID, TEST_ORG_ID)

    const fromMock = (db as unknown as { from: ReturnType<typeof vi.fn> }).from
    const tablesCalled: string[] = (fromMock.mock.calls as [string][]).map(([t]) => t)
    expect(tablesCalled).not.toContain('application_co_applicants')
  })
})
