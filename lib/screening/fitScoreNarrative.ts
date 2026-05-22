/**
 * lib/screening/fitScoreNarrative.ts — FitScore narrative engine: generates evidence-anchored prose via Sonnet 4.6
 *
 * Auth:   internal — called by lib/screening/fitScoreOrchestrator.ts after the deterministic engine runs
 * Data:   Anthropic API via lib/ai/client.ts (logged to ai_usage table)
 * Notes:  System prompt: lib/screening/prompts/fitScoreNarrative.v1.0.ts (imported constant, no file I/O).
 *         API errors retry once (250ms + 1s backoff) then fall back to templated response.
 *         Malformed output and banned-phrase detection trigger immediate fallback with Sentry capture.
 *         Prompt version: narr.v1.0. Version bump requires new .vX.Y.ts prompt module + constant update.
 *         Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §7.
 */
import * as Sentry from "@sentry/nextjs"
import type { TextBlockParam } from "@anthropic-ai/sdk/resources/messages/messages"
import { createMessage } from "@/lib/ai/client"
import type { EngineResult, ApplicantInput } from "@/lib/screening/fitScoreEngine.v1"
import { isForeignNational } from "@/lib/screening/fitScoreEngine.v1"
import { FITSCORE_NARRATIVE_PROMPT_V1_1 } from "@/lib/screening/prompts/fitScoreNarrative.v1.1"

export const CURRENT_PROMPT_VERSION = 'narr.v1.1'

// ─── Output type ──────────────────────────────────────────────────────────────

export interface NarrativeResponse {
  observedStrengths: string[]
  observedConcerns: string[]
  limitedVisibility: string[]
  affordabilityEvidenceLine: string
  stabilityEvidenceLine: string
  creditEvidenceLine: string | null
  verificationEvidenceLine: string
  // Per-dimension observation bullets (narr.v1.1). 3 items each, ≤20 words per item.
  affordabilityObservations: string[]
  stabilityObservations: string[]
  creditObservations: string[] | null   // null for all-foreign-national lease
  verificationObservations: string[]
  ldpSummary: string | null
  isTemplated: boolean
  failureReason: 'api_error' | 'malformed_output' | 'banned_phrase_detected' | null
}

// ─── Cached system prompt block ───────────────────────────────────────────────

const SYSTEM_PROMPT_BLOCK: TextBlockParam = {
  type: 'text',
  text: FITSCORE_NARRATIVE_PROMPT_V1_1,
  cache_control: { type: 'ephemeral' },
}

// ─── Tool definition (DELIVERY.md §7.8) ──────────────────────────────────────

const SUBMIT_NARRATIVE_TOOL = {
  name: 'submit_fitscore_narrative',
  description: 'Submit the structured FitScore narrative for the given lease application.',
  input_schema: {
    type: 'object' as const,
    properties: {
      observed_strengths: {
        type: 'array',
        items: { type: 'string' },
        description: 'Factual positive signals, ≤5 bullets, ≤20 words each. Empty array → use empty-state text.',
      },
      observed_concerns: {
        type: 'array',
        items: { type: 'string' },
        description: 'Factual concerning signals, ≤7 bullets, ≤20 words each. Empty array → use empty-state text.',
      },
      limited_visibility: {
        type: 'array',
        items: { type: 'string' },
        description: 'Unavailable or thin signals, ≤5 bullets, ≤20 words each. Empty array → use empty-state text.',
      },
      affordability_evidence_line: { type: 'string', description: 'Dimension card evidence, ≤18 words.' },
      stability_evidence_line:     { type: 'string', description: 'Dimension card evidence, ≤18 words.' },
      credit_evidence_line: {
        type: ['string', 'null'],
        description: 'Dimension card evidence, ≤18 words. Null for foreign-national-only lease.',
      },
      verification_evidence_line:  { type: 'string', description: 'Dimension card evidence, ≤18 words.' },
      affordability_observations: {
        type: 'array',
        items: { type: 'string' },
        description: '3 observation bullets for Affordability, each ≤20 words, grounded in supplied evidence.',
      },
      stability_observations: {
        type: 'array',
        items: { type: 'string' },
        description: '3 observation bullets for Stability, each ≤20 words, grounded in supplied evidence.',
      },
      credit_observations: {
        type: ['array', 'null'],
        items: { type: 'string' },
        description: '3 observation bullets for Credit Behaviour, each ≤20 words. Null for foreign-national-only lease.',
      },
      verification_observations: {
        type: 'array',
        items: { type: 'string' },
        description: '3 observation bullets for Verification Integrity, each ≤20 words, grounded in supplied evidence.',
      },
      ldp_summary: {
        type: ['string', 'null'],
        description: 'For Limited Data Profile: one sentence on why the engine refused to score. Null otherwise.',
      },
    },
    required: [
      'observed_strengths', 'observed_concerns', 'limited_visibility',
      'affordability_evidence_line', 'stability_evidence_line', 'verification_evidence_line',
      'affordability_observations', 'stability_observations', 'verification_observations',
    ],
  },
}

// ─── Banned-phrase deterministic scan (DELIVERY.md §7.10) ─────────────────────

// Exported for unit testing — not part of the external API surface.
export const BANNED_PATTERNS: RegExp[] = [
  /\brecommend(?:ed|ation)?\b/i,
  /\badvise[sd]?\b/i,
  /\badvisable\b/i,
  /\bapprove[sd]?\b/i,
  /\bapproval\b/i,
  /\baccept(?:ed)?\b/i,
  /\breject(?:ed)?\b/i,
  /\bdecline[sd]?\b/i,
  /\bqualif(?:y|ied)\b/i,
  /\bdisqualif(?:y|ied)\b/i,
  /\bunqualified\b/i,
  /ready to lease/i,
  /not ready to lease/i,
  /the agent should/i,
  /the landlord should/i,
  /manual review recommended/i,
  /\brequired to\b/i,
  /\bneeds to\b/i,
  /\bhas to\b/i,
  /\badvised to\b/i,
  /\bencouraged to\b/i,
  /\bgood tenant\b/i,
  /\bbad tenant\b/i,
  /\bstrong (?:tenant|applicant)\b/i,
  /\bweak (?:tenant|applicant)\b/i,
  /\brisky\b/i,
  /\btrustworthy\b/i,
  /\buntrustworthy\b/i,
  /track record of/i,
  /likely to (?:pay|default)\b/i,
  /unlikely to (?:pay|default)\b/i,
  /\bexpected to\b/i,
  /\bnot expected to\b/i,
  /\bprobability of\b/i,
  /\bchances of\b/i,
  /\bwill (?:pay|default)\b/i,
  /\bpredict(?:s|ed|ion)?\b/i,
  /\bforecast(?:s|ed)?\b/i,
  /\bproject(?:ed|s)\b/i,
  /\bappears to\b/i,
  /\bseems to\b/i,
  /\bmay have\b/i,
  /\bmight have\b/i,
  /\breliable\b/i,
  /\bunreliable\b/i,
  /\bcould be\b/i,
]

export function findBannedPhrase(r: NarrativeResponse): string | null {
  const text = [
    ...r.observedStrengths, ...r.observedConcerns, ...r.limitedVisibility,
    r.affordabilityEvidenceLine, r.stabilityEvidenceLine,
    r.creditEvidenceLine ?? '', r.verificationEvidenceLine,
    ...(r.affordabilityObservations ?? []),
    ...(r.stabilityObservations ?? []),
    ...(r.creditObservations ?? []),
    ...(r.verificationObservations ?? []),
    r.ldpSummary ?? '',
  ].join('\n')
  for (const pat of BANNED_PATTERNS) {
    const m = pat.exec(text)
    if (m) return m[0]
  }
  return null
}

// ─── NarrativeRequest builder ─────────────────────────────────────────────────

export function buildRequest(result: EngineResult, applicants: ApplicantInput[]): string {
  const snap = result.componentSnapshot
  const lease = snap.lease
  const isAllForeign = applicants.every(a => isForeignNational(a.nationalityType))

  const totalDebtCents = applicants.reduce((sum, a) => {
    const xds = a.bureauScores.find(b => b.bureau === 'xds')
    return sum + (xds?.monthlyInstalmentCents ?? 0)
  }, 0)
  const debtPct = lease.totalVerifiedIncomeCents > 0
    ? Math.round((totalDebtCents / lease.totalVerifiedIncomeCents) * 100)
    : null

  const incomeWeightedTenureMonths = lease.totalVerifiedIncomeCents > 0
    ? snap.applicants.reduce((sum, s) => {
        const inp = applicants.find(a => a.id === s.id)
        return sum + ((inp?.employmentTenureMonths ?? 0) * s.verifiedIncomeCents / lease.totalVerifiedIncomeCents)
      }, 0)
    : 0

  const totalRefs = applicants.reduce((sum, a) => sum + a.verifiedRentalReferences, 0)

  // Bureau signals: pass only responding bureau names — no fabricated coverage grades.
  // Coverage details not extracted in v1 (§11.19 upstream gap). The narrative engine
  // narrates what's true: "N bureaus responded" without adjective-graded coverage.
  const creditSignals = snap.applicants.map(s => {
    const bp = s.bureauProcessing
    const inp = applicants.find(a => a.id === s.id)
    return {
      applicant_label: s.label,
      responding_bureaus: bp.responding.filter(b => !bp.outliers.includes(b)),
      outliers_excluded: bp.outliers,
      adverse_listings_count: inp?.bureauScores.reduce((n, bs) => n + bs.adverseListingCount, 0) ?? 0,
    }
  })

  const verificationSignals = snap.applicants.map(s => {
    const inp = applicants.find(a => a.id === s.id)
    const statuses = inp ? [
      inp.identityMatchStatus, inp.employerConsistencyStatus,
      inp.salaryReconciliationStatus, inp.documentConsistencyStatus,
      inp.bankOwnershipStatus,
    ] : []
    const passedBonus = inp?.secondaryReferencePresent ? 1 : 0
    return {
      applicant_label: s.label,
      checks_passed: statuses.filter(c => c === 'pass').length + passedBonus,
      checks_total: statuses.length + passedBonus || 5,
      identity_match: inp?.identityMatchStatus ?? 'not_attempted',
      income_evidence_tier: s.incomeTier ?? 4,
    }
  })

  return JSON.stringify({
    prompt_version: CURRENT_PROMPT_VERSION,
    engine_version: result.engineVersion,
    band: result.band,
    is_ldp: lease.isLimitedDataProfile,
    composite_score: result.score,
    confidence_index: result.confidenceIndex,
    verification_integrity: result.verificationIntegrity,
    dimensional_scores: {
      affordability: result.components.affordability,
      stability: result.components.stability,
      credit_behaviour: isAllForeign ? null : result.components.creditBehaviour,
      verification_integrity: result.components.verificationIntegrity,
    },
    affordability_signals: {
      proposed_rent_cents: lease.proposedRentCents,
      verified_joint_income_cents: lease.totalVerifiedIncomeCents,
      rent_to_income_pct: Math.round(lease.rentToIncomeRatio * 100),
      // F3: only include debt_servicing_pct when XDS returned actual instalment data.
      // Zero means "no XDS data" here, not "zero debt" — omitting avoids fabricating 0%.
      ...(totalDebtCents > 0 ? { debt_servicing_pct: debtPct } : {}),
      disposable_income_cents: lease.totalVerifiedIncomeCents - lease.proposedRentCents - totalDebtCents,
    },
    stability_signals: {
      // F2: income_weighted_median_tenure_months is always 0 until ADDENDUM_14D ships
      // (employmentTenureMonths hardcoded null in orchestrator). Included as 0 — factually
      // true that no tenure data is available. address_continuity_grade omitted entirely:
      // address history not yet collected, so emitting 'low' would be fabricated.
      income_weighted_median_tenure_months: Math.round(incomeWeightedTenureMonths),
      rental_references_verified: totalRefs,
    },
    credit_signals: creditSignals,
    verification_signals: verificationSignals,
    material_flags: result.materialFlags,
    pleks_network_signals: applicants.map(a => ({
      applicant_label: snap.applicants.find(s => s.id === a.id)?.label ?? 'Applicant A',
      status: a.pleksNetworkStatus,
      tenancy_count: a.pleksNetworkTenancyCount,
    })),
    lease_composition: {
      applicant_count: applicants.length,
      sa_citizen_count: applicants.filter(
        a => a.nationalityType === 'sa_citizen' || a.nationalityType === 'permanent_resident'
      ).length,
      foreign_national_count: applicants.filter(
        a => a.nationalityType !== 'sa_citizen' && a.nationalityType !== 'permanent_resident'
      ).length,
    },
  }, null, 2)
}

// ─── Tool output parser ───────────────────────────────────────────────────────

export function parseToolInput(raw: unknown): NarrativeResponse | null {
  if (!raw || typeof raw !== 'object') return null
  const t = raw as Record<string, unknown>
  if (!Array.isArray(t.observed_strengths) || !Array.isArray(t.observed_concerns) || !Array.isArray(t.limited_visibility)) return null
  if (typeof t.affordability_evidence_line !== 'string') return null
  if (typeof t.stability_evidence_line !== 'string') return null
  if (typeof t.verification_evidence_line !== 'string') return null
  if (!Array.isArray(t.affordability_observations)) return null
  if (!Array.isArray(t.stability_observations)) return null
  if (!Array.isArray(t.verification_observations)) return null
  return {
    observedStrengths:         (t.observed_strengths as unknown[]).filter(s => typeof s === 'string') as string[],
    observedConcerns:          (t.observed_concerns  as unknown[]).filter(s => typeof s === 'string') as string[],
    limitedVisibility:         (t.limited_visibility as unknown[]).filter(s => typeof s === 'string') as string[],
    affordabilityEvidenceLine: t.affordability_evidence_line,
    stabilityEvidenceLine:     t.stability_evidence_line,
    creditEvidenceLine:        typeof t.credit_evidence_line   === 'string' ? t.credit_evidence_line   : null,
    verificationEvidenceLine:  t.verification_evidence_line,
    affordabilityObservations: (t.affordability_observations as unknown[]).filter(s => typeof s === 'string') as string[],
    stabilityObservations:     (t.stability_observations     as unknown[]).filter(s => typeof s === 'string') as string[],
    creditObservations:        Array.isArray(t.credit_observations)
      ? (t.credit_observations as unknown[]).filter(s => typeof s === 'string') as string[]
      : null,
    verificationObservations:  (t.verification_observations  as unknown[]).filter(s => typeof s === 'string') as string[],
    ldpSummary:                typeof t.ldp_summary            === 'string' ? t.ldp_summary            : null,
    isTemplated:   false,
    failureReason: null,
  }
}

// ─── Templated fallback (DELIVERY.md §7.10) ───────────────────────────────────

function templatedFallback(
  result: EngineResult,
  applicants: ApplicantInput[],
  failureReason: NarrativeResponse['failureReason'],
): NarrativeResponse {
  const lease = result.componentSnapshot.lease
  const rentPct = Math.round(lease.rentToIncomeRatio * 100)
  const bureauCount = new Set(applicants.flatMap(a => a.bureauScores.map(b => b.bureau))).size
  const totalChecks = applicants.length * 5
  const passedChecks = applicants.reduce((sum, a) => sum + [
    a.identityMatchStatus, a.employerConsistencyStatus,
    a.salaryReconciliationStatus, a.documentConsistencyStatus, a.bankOwnershipStatus,
  ].filter(c => c === 'pass').length, 0)
  const isAllForeign = applicants.every(a => isForeignNational(a.nationalityType))
  const bureauPlural = bureauCount === 1 ? '' : 's'
  const unavailMsg = '(Narrative generation was unavailable for this report. See the dimensional scores and Material Flags above for the engine\'s findings.)'
  return {
    observedStrengths:         [unavailMsg],
    observedConcerns:          [unavailMsg],
    limitedVisibility:         [unavailMsg],
    affordabilityEvidenceLine: `Rent ${rentPct}% of verified joint income.`,
    stabilityEvidenceLine:     `Stability signals not available; income-weighted tenure not recorded.`,
    creditEvidenceLine:        isAllForeign ? null : `Coverage across ${bureauCount} bureau${bureauPlural}.`,
    verificationEvidenceLine:  `${passedChecks} of ${totalChecks} verification checks passed.`,
    affordabilityObservations: [unavailMsg],
    stabilityObservations:     [unavailMsg],
    creditObservations:        isAllForeign ? null : [unavailMsg],
    verificationObservations:  [unavailMsg],
    ldpSummary:                lease.isLimitedDataProfile
      ? 'Engine did not produce a composite score due to insufficient verified income signals.'
      : null,
    isTemplated:   true,
    failureReason,
  }
}

// ─── API call helper ──────────────────────────────────────────────────────────

async function callNarrativeApi(
  messages: Parameters<typeof createMessage>[0]['messages'],
  orgId: string,
  band: string,
  engineVersion: string,
  isRetry = false,
): Promise<NarrativeResponse | null> {
  const { message } = await createMessage(
    {
      model: 'claude-sonnet-4-6',
      max_tokens: 1200,
      system: [SYSTEM_PROMPT_BLOCK],
      messages,
      tools: [SUBMIT_NARRATIVE_TOOL],
      tool_choice: { type: 'tool', name: 'submit_fitscore_narrative' },
    },
    { orgId, purpose: 'fitscore_reasoning', metadata: { band, engine_version: engineVersion, ...(isRetry ? { retry: true } : {}) } },
  )
  const toolBlock = message.content.find(b => b.type === 'tool_use')
  return toolBlock?.type === 'tool_use' ? parseToolInput(toolBlock.input) : null
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export async function generateFitScoreNarrative(
  result: EngineResult,
  applicants: ApplicantInput[],
  orgId: string,
): Promise<NarrativeResponse> {
  const userMessage = buildRequest(result, applicants)
  const messages: Parameters<typeof createMessage>[0]['messages'] = [
    { role: 'user', content: userMessage },
  ]

  // ── First attempt ──────────────────────────────────────────────────────────
  let parsed: NarrativeResponse | null = null
  try {
    parsed = await callNarrativeApi(messages, orgId, result.band, result.engineVersion)
  } catch (err) {
    // API error: retry once with exponential backoff (§7.10 Failure 1)
    await new Promise(r => setTimeout(r, 250))
    try {
      parsed = await callNarrativeApi(messages, orgId, result.band, result.engineVersion, true)
    } catch (retryErr) {
      Sentry.captureException(retryErr, {
        tags: { origin: 'fitscore_narrative', failure: 'api_error' },
        extra: { band: result.band, original_error: String(err) },
      })
      return templatedFallback(result, applicants, 'api_error')
    }
  }

  // ── Malformed output (§7.10 Failure 2) ────────────────────────────────────
  if (!parsed) {
    Sentry.captureMessage('FitScore narrative: malformed tool output', {
      level: 'error',
      extra: { band: result.band },
    })
    return templatedFallback(result, applicants, 'malformed_output')
  }

  // ── Banned-phrase scan — immediate fallback on detection (§7.10 Failure 3) ─
  const phrase = findBannedPhrase(parsed)
  if (phrase) {
    Sentry.captureMessage('FitScore narrative: banned phrase detected', {
      level: 'error',
      extra: { phrase, band: result.band },
    })
    return templatedFallback(result, applicants, 'banned_phrase_detected')
  }

  return parsed
}
