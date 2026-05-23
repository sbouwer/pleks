/**
 * lib/screening/prompts/synthesisTemplate.v1.0.1.ts — Deterministic synthesis paragraph for FitScore reports
 *
 * Data:   FitScoreReportData from _primitives/theme
 * Notes:  Deterministic — no AI call. Three branches: Standard (scored), LDP, Blocked.
 *         Output is rendered directly — do NOT wrap with sp(); em-dashes must survive.
 *         Diff vs v1.0: SYNTHESIS_TEMPLATE_VERSION bump; critical-flag sentence in standard
 *         branch; blocked branch references "Material flags card" not "section 1".
 *         Spec: ADDENDUM_14H_FITSCORE_DELIVERY.md §E.4.
 */

import type { FitScoreReportData } from "@/lib/reports/screening/_primitives/theme"
import { BAND_LABELS } from "@/lib/reports/screening/_primitives/theme"

export const SYNTHESIS_TEMPLATE_VERSION = 'synthesis.v1.0.1'

function countCriticalFlags(data: FitScoreReportData): number {
  return data.materialFlags.filter(f => f.class === 'critical').length
}

function countPopulatedDimensions(data: FitScoreReportData): number {
  const s = data.dimensionalScores
  return [s.affordability, s.stability, s.creditBehaviour, s.verificationIntegrity]
    .filter(v => v !== null).length
}

function countDimensionsAboveOrAtThreshold(data: FitScoreReportData): number {
  const s = data.dimensionalScores
  const checks = [
    s.affordability >= s.affordability_preferred_threshold,
    s.stability    >= s.stability_preferred_threshold,
    s.creditBehaviour !== null &&
      s.creditBehaviour_preferred_threshold !== null &&
      s.creditBehaviour >= s.creditBehaviour_preferred_threshold,
    s.verificationIntegrity >= s.verificationIntegrity_preferred_threshold,
  ]
  return checks.filter(Boolean).length
}

export function buildSynthesis(data: FitScoreReportData): string {
  if (data.isLdp) {
    return [
      'Pleks did not produce a composite score for this lease application.',
      'The available evidence fell below the threshold required for a confident composite assessment.',
      'Manual review by the agent is required.',
      'Final tenancy decisions rest with the agent or landlord.',
    ].join(' ')
  }

  if (data.band === 'blocked') {
    const n = countCriticalFlags(data)
    // Invariant: band === 'blocked' is set only when at least one critical flag fires.
    // n === 0 here indicates an engine inconsistency; phrase degrades gracefully.
    const flagPhrase = n === 1 ? '1 critical flag prevents' : `${n} critical flags prevent`
    return [
      `This lease application is blocked — ${flagPhrase} composite assessment.`,
      'See the Material flags card for the specific signals that triggered this state.',
      'Final tenancy decisions rest with the agent or landlord.',
    ].join(' ')
  }

  const n = countDimensionsAboveOrAtThreshold(data)
  const m = countPopulatedDimensions(data)
  const score = data.score !== null ? String(data.score) : 'N/A'
  const dimSentence = n === 0
    ? `None of the ${m} applicable dimensions met or exceeded their preferred threshold.`
    : `${n} of ${m} dimensions met or exceeded their preferred threshold.`

  const critCount = countCriticalFlags(data)
  let critSentence: string | null = null
  if (critCount === 1) {
    critSentence = 'One material flag (critical) observed — see the Material flags card.'
  } else if (critCount > 1) {
    critSentence = `${critCount} material flags (critical) observed — see the Material flags card.`
  }

  return [
    `${BAND_LABELS[data.band]} — composite ${score}.`,
    dimSentence,
    critSentence,
    `Band placement confidence: ${data.confidenceIndex}.`,
    'Final tenancy decisions rest with the agent or landlord.',
  ].filter((s): s is string => s !== null).join(' ')
}
