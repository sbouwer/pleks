/**
 * lib/screening/fitScoreEngine.v1.ts — FitScore composite scoring engine, version 1.0
 *
 * Auth:   internal — called only by lib/screening/fitScoreOrchestrator.ts
 * Data:   pure function; no DB access, no async, no AI calls
 * Notes:  deterministic and fully versioned. Any change to scoring logic requires an
 *         ENGINE_VERSION bump and a new file (fitScoreEngine.v2.ts). Do NOT modify
 *         this file post-ship — all runs against historical applications must replay
 *         identically. Spec: ADDENDUM_14H_FITSCORE_COMPOSITE.md §§2-4.
 */

import { createHash } from 'crypto'

export const ENGINE_VERSION = 'fitscore.v1.0.1'

// ─── Input types ──────────────────────────────────────────────────────────────

export type VerificationStatus = 'pass' | 'fail' | 'pending' | 'not_attempted'
export type PleksNetworkStatus = 'trusted' | 'adverse' | 'none'
export type FlagClass = 'critical' | 'capping' | 'trust'

export type FitScoreBand =
  | 'verified_stability'
  | 'stable_profile'
  | 'cautious_review'
  | 'limited_confidence'
  | 'adverse_signals'
  | 'limited_data_profile'
  | 'blocked'

export type ConfidenceGrade = 'high' | 'medium' | 'low' | 'insufficient'
export type VerificationIntegrityGrade = 'high' | 'medium' | 'low' | 'limited'

export interface BureauScore {
  bureau: 'transunion' | 'vericred' | 'sigma' | 'xds' | 'compuscan' | 'experian'
  delphiScore: number | null            // null for XDS (no scalar score)
  coverageMonths: number
  hasAdverseListings: boolean
  adverseListingCount: number
  writtenOffCount: number
  monthlyInstalmentCents: number | null
  hasSAFPS: boolean
  hasDebtReview: boolean
  hasActiveJudgment: boolean
  judgmentAgeMonths: number | null
  idReissueAgeMonths: number | null
}

export interface ApplicantInput {
  id: string
  label: string                        // "Applicant A", "Applicant B"…
  nationalityType: string              // applicant_nationality_type enum value

  // Income evidence — best available tier (§4.2); null = not yet resolved
  tier1IncomeCents: number | null      // bank deposit mean (ADDENDUM_14D)
  tier2IncomeCents: number | null      // payslip net pay mean
  tier3IncomeCents: number | null      // VCCB gross estimate (cents)
  tier4IncomeCents: number | null      // declared gross income

  // Bureau data (from Combined Consumer Credit Report)
  bureauScores: BureauScore[]

  // Verification check outcomes (§2.8)
  identityMatchStatus: VerificationStatus
  employerConsistencyStatus: VerificationStatus
  salaryReconciliationStatus: VerificationStatus
  documentConsistencyStatus: VerificationStatus
  bankOwnershipStatus: VerificationStatus
  secondaryReferencePresent: boolean

  // Stability signals (§2.6)
  employmentTenureMonths: number | null
  addressMoves36Months: number | null
  bankAccountLongevityMonths: number | null
  salaryDepositConsistencyMonths: number | null
  verifiedRentalReferences: number

  // Pleks-network history (ADDENDUM_14K)
  pleksNetworkStatus: PleksNetworkStatus
  pleksNetworkTenancyCount: number
}

export interface EngineInput {
  applicationId: string
  proposedRentCents: number
  applicants: ApplicantInput[]         // ≥1; first entry is primary applicant
  computedAt: string                   // ISO timestamp (set by orchestrator)
}

// ─── Output types ─────────────────────────────────────────────────────────────

export interface MaterialFlag {
  flag: string
  class: FlagClass
  applicantId: string | null
  applicantLabel: string | null
  description: string
  source: string
  capApplied: boolean
  capCeiling: FitScoreBand | null
  observedAt: string
}

export interface DimensionScores {
  affordability: number
  stability: number
  creditBehaviour: number
  verificationIntegrity: number
}

// Full computation breakdown — versioned to v1.0 shape. Replay tooling reads this.
export interface ComponentSnapshot {
  engineVersion: string
  applicants: ApplicantSnapshot[]
  lease: LeaseSnapshot
}

export interface ApplicantSnapshot {
  id: string
  label: string
  nationalityType: string
  isForeignNational: boolean
  incomeTier: 1 | 2 | 3 | 4 | null
  verifiedIncomeCents: number
  incomeSharePct: number
  verificationIntegrityScore: number
  verificationIntegrityGrade: VerificationIntegrityGrade
  incomeVarianceViGradeDelta: number
  viAdjustmentsApplied: string[]
  bureauProcessing: BureauProcessingSnapshot
  stabilityScore: number
  stabilitySignalCount: number
  compositeWeighted: number
  compositeWeights: { affordability: number, stability: number, creditBehaviour: number, verificationIntegrity: number }
  flagsDetected: string[]
}

export interface BureauProcessingSnapshot {
  responding: string[]
  outliers: string[]
  coverageWeights: Record<string, number>
  delphiScores: Record<string, number | null>
  weightedMedianDelphi: number | null
  dimensionalScore: number
  adverseAdjustment: number
  divergenceDetected: boolean
}

export interface LeaseSnapshot {
  totalVerifiedIncomeCents: number
  proposedRentCents: number
  rentToIncomeRatio: number
  affordabilityScore: number
  stabilityScore: number
  creditBehaviourScore: number
  verificationIntegrityDimensionalScore: number
  leaseVerificationIntegrityGrade: VerificationIntegrityGrade
  verificationIntegrityCap: FitScoreBand | null
  rawComposite: number
  isLimitedDataProfile: boolean
  ldpMissingSignals: string[]
  confidenceGrade: ConfidenceGrade
  confidenceReductions: string[]
  hardFlagsApplied: string[]
  bandBeforeCaps: FitScoreBand
  finalBand: FitScoreBand
}

export interface PreferredThresholds {
  affordability: number
  stability: number
  creditBehaviour: number | null        // null for all-foreign-national lease
  verificationIntegrity: number
}

export interface EngineResult {
  score: number | null                  // null for LDP and Blocked
  band: FitScoreBand
  confidenceIndex: ConfidenceGrade
  verificationIntegrity: VerificationIntegrityGrade
  materialFlags: MaterialFlag[]
  components: DimensionScores
  preferredThresholds: PreferredThresholds
  engineVersion: string
  inputsHash: string
  componentSnapshot: ComponentSnapshot
}

// v1.0 static lookup; Stability will vary per-case in v1.1 when per-case tenure data is available.
export function getPreferredThresholds(isAllForeignNational: boolean): PreferredThresholds {
  return {
    affordability:        70,
    stability:            60,
    creditBehaviour:      isAllForeignNational ? null : 65,
    verificationIntegrity: 80,
  }
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SA_WEIGHTS = { affordability: 0.35, stability: 0.25, creditBehaviour: 0.20, verificationIntegrity: 0.20 }
const FOREIGN_WEIGHTS = { affordability: 0.50, stability: 0.30, creditBehaviour: 0.00, verificationIntegrity: 0.20 }

const VI_CHECK_WEIGHTS = { identity: 30, employer: 20, salary: 20, document: 15, bankOwnership: 15 }
const VI_SECONDARY_BONUS = 5

// Delphi → dimensional score curve (v1.0). Calibrated to §4.8 worked example (712 → 80).
// Piecewise linear between breakpoints [delphiScore, dimensionalScore].
const DELPHI_CURVE: [number, number][] = [
  [300, 0], [500, 15], [600, 50], [680, 72], [720, 82], [780, 90], [850, 96], [999, 100],
]

// Verification Integrity → maximum band cap (§2.8 multiplier role)
const VI_BAND_CAP: Record<VerificationIntegrityGrade, FitScoreBand | null> = {
  high:    null,              // no cap
  medium:  'stable_profile',
  low:     'cautious_review',
  limited: 'limited_confidence',
}

// Band ordering for cap enforcement (higher index = higher band)
const BAND_ORDER: FitScoreBand[] = [
  'adverse_signals', 'limited_confidence', 'cautious_review',
  'stable_profile', 'verified_stability',
]

// VI grade ordering for variance downshift (higher index = lower grade)
const VI_GRADE_ORDER: VerificationIntegrityGrade[] = ['high', 'medium', 'low', 'limited']

// ─── Pure helpers ─────────────────────────────────────────────────────────────

export function isForeignNational(nationalityType: string): boolean {
  return nationalityType.startsWith('foreign_') || nationalityType === 'foreign_national'
}

function compositeWeights(nationalityType: string) {
  return isForeignNational(nationalityType) ? FOREIGN_WEIGHTS : SA_WEIGHTS
}

function statusScore(s: VerificationStatus): number {
  return s === 'pass' ? 1 : 0
}

function piecewiseLinear(curve: [number, number][], x: number): number {
  const clamped = Math.max(curve[0][0], Math.min(curve[curve.length - 1][0], x))
  for (let i = 0; i < curve.length - 1; i++) {
    const [x0, y0] = curve[i]
    const [x1, y1] = curve[i + 1]
    if (clamped <= x1) return y0 + ((clamped - x0) / (x1 - x0)) * (y1 - y0)
  }
  return curve[curve.length - 1][1]
}

function delphiToDimensional(delphi: number): number {
  return piecewiseLinear(DELPHI_CURVE, delphi)
}

function bureauCoverageWeight(months: number): number {
  if (months >= 60) return 1.0
  if (months >= 24) return 0.7
  return 0.4
}

// Coverage-weighted median (§4.4 Step B)
function weightedMedian(values: { value: number; weight: number }[]): number {
  if (values.length === 0) return 0
  if (values.length === 1) return values[0].value

  const sorted = [...values].sort((a, b) => a.value - b.value)
  const totalWeight = sorted.reduce((sum, v) => sum + v.weight, 0)
  let cumulative = 0
  for (const item of sorted) {
    cumulative += item.weight
    if (cumulative >= totalWeight / 2) return item.value
  }
  return sorted[sorted.length - 1].value
}

// Outlier detection: >2σ from cluster median, only when ≥3 scores (§4.5)
function outlierMask(scores: number[]): boolean[] {
  if (scores.length < 3) return scores.map(() => false)

  const sorted = [...scores].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]
  const variance = scores.reduce((sum, s) => sum + (s - median) ** 2, 0) / scores.length
  const sigma = Math.sqrt(variance)

  return scores.map(s => Math.abs(s - median) > 2 * sigma)
}

function capBand(band: FitScoreBand, ceiling: FitScoreBand): FitScoreBand {
  const ceilIndex = BAND_ORDER.indexOf(ceiling)
  const bandIndex = BAND_ORDER.indexOf(band)
  if (ceilIndex === -1 || bandIndex === -1) return band
  return bandIndex > ceilIndex ? ceiling : band
}

function assignBand(score: number): FitScoreBand {
  if (score >= 85) return 'verified_stability'
  if (score >= 70) return 'stable_profile'
  if (score >= 55) return 'cautious_review'
  if (score >= 40) return 'limited_confidence'
  return 'adverse_signals'
}

function viGrade(score: number): VerificationIntegrityGrade {
  if (score >= 80) return 'high'
  if (score >= 55) return 'medium'
  if (score >= 30) return 'low'
  return 'limited'
}

function reduceVIGrade(grade: VerificationIntegrityGrade, steps: number): VerificationIntegrityGrade {
  if (steps <= 0) return grade
  const idx = VI_GRADE_ORDER.indexOf(grade)
  return VI_GRADE_ORDER[Math.min(idx + steps, VI_GRADE_ORDER.length - 1)]
}

// ─── Income tier resolution (§4.2) ───────────────────────────────────────────

function resolveIncome(a: ApplicantInput): { tier: 1 | 2 | 3 | 4; amountCents: number } {
  if (a.tier1IncomeCents !== null && a.tier1IncomeCents > 0)
    return { tier: 1, amountCents: a.tier1IncomeCents }
  if (a.tier2IncomeCents !== null && a.tier2IncomeCents > 0)
    return { tier: 2, amountCents: a.tier2IncomeCents }
  if (!isForeignNational(a.nationalityType) && a.tier3IncomeCents !== null && a.tier3IncomeCents > 0)
    return { tier: 3, amountCents: a.tier3IncomeCents }
  return { tier: 4, amountCents: a.tier4IncomeCents ?? 0 }
}

// ─── Income variance reconciliation (§4.3) ───────────────────────────────────

function computeIncomeVariance(
  a: ApplicantInput,
  authTier: 1 | 2 | 3 | 4,
  authCents: number,
  computedAt: string,
): { viGradeDelta: number; flags: MaterialFlag[]; maxVariancePct: number | null } {
  if (authCents <= 0) return { viGradeDelta: 0, flags: [], maxVariancePct: null }

  const lowerTierValues: number[] = []
  if (authTier < 2 && a.tier2IncomeCents !== null && a.tier2IncomeCents > 0)
    lowerTierValues.push(a.tier2IncomeCents)
  if (authTier < 3 && a.tier3IncomeCents !== null && a.tier3IncomeCents > 0)
    lowerTierValues.push(a.tier3IncomeCents)
  if (authTier < 4 && a.tier4IncomeCents !== null && a.tier4IncomeCents > 0)
    lowerTierValues.push(a.tier4IncomeCents)

  if (lowerTierValues.length === 0) return { viGradeDelta: 0, flags: [], maxVariancePct: null }

  const maxVariance = Math.max(...lowerTierValues.map(v => Math.abs(authCents - v) / authCents))
  const maxVariancePct = Math.round(maxVariance * 100)
  const flags: MaterialFlag[] = []
  let viGradeDelta = 0

  if (maxVariance > 0.4) {
    viGradeDelta = 2
    flags.push({
      flag: 'income_discrepancy_material',
      class: 'capping',
      applicantId: a.id,
      applicantLabel: a.label,
      description: `Income variance of ${maxVariancePct}% between verified and declared income for ${a.label} — material overstatement risk.`,
      source: 'income_evidence_reconciliation',
      capApplied: true,
      capCeiling: 'cautious_review',
      observedAt: computedAt,
    })
  } else if (maxVariance > 0.25) {
    viGradeDelta = 1
    flags.push({
      flag: 'income_discrepancy_observed',
      class: 'capping',
      applicantId: a.id,
      applicantLabel: a.label,
      description: `Income variance of ${maxVariancePct}% observed between verified and declared income for ${a.label}.`,
      source: 'income_evidence_reconciliation',
      capApplied: false,
      capCeiling: null,
      observedAt: computedAt,
    })
  } else if (maxVariance > 0.1) {
    viGradeDelta = 1
  }

  return { viGradeDelta, flags, maxVariancePct }
}

// ─── Verification Integrity per applicant (§2.8) ──────────────────────────────

function computeApplicantVI(a: ApplicantInput, viGradeDelta: number = 0): {
  score: number
  grade: VerificationIntegrityGrade
  adjustments: string[]
} {
  const base =
    VI_CHECK_WEIGHTS.identity      * statusScore(a.identityMatchStatus) +
    VI_CHECK_WEIGHTS.employer      * statusScore(a.employerConsistencyStatus) +
    VI_CHECK_WEIGHTS.salary        * statusScore(a.salaryReconciliationStatus) +
    VI_CHECK_WEIGHTS.document      * statusScore(a.documentConsistencyStatus) +
    VI_CHECK_WEIGHTS.bankOwnership * statusScore(a.bankOwnershipStatus)

  const bonus = a.secondaryReferencePresent ? VI_SECONDARY_BONUS : 0
  const score = Math.min(100, base + bonus)
  const grade = reduceVIGrade(viGrade(score), viGradeDelta)
  const adjustments: string[] = []

  if (a.identityMatchStatus === 'fail') adjustments.push('identity_match_failed')
  if (a.identityMatchStatus === 'not_attempted') adjustments.push('identity_match_not_attempted')
  if (viGradeDelta > 0) adjustments.push(`income_variance_vi_grade_reduced_${viGradeDelta}`)

  return { score, grade, adjustments }
}

// ─── Bureau credit processing per applicant (§4.4) ────────────────────────────

function processBureau(
  a: ApplicantInput,
  flags: MaterialFlag[],
  confidenceReductions: string[],
  computedAt: string,
): { dimensionalScore: number; snapshot: BureauProcessingSnapshot } {
  const scoringBureaus = a.bureauScores.filter(b => b.delphiScore !== null)
  const rawScores = scoringBureaus.map(b => b.delphiScore as number)
  const outliers = outlierMask(rawScores)

  const active = scoringBureaus.filter((_, i) => !outliers[i])
  const outlierBureaus = scoringBureaus.filter((_, i) => outliers[i]).map(b => b.bureau)

  if (outlierBureaus.length > 0) {
    flags.push({
      flag: 'bureau_outlier_excluded',
      class: 'capping',
      applicantId: a.id,
      applicantLabel: a.label,
      description: `Bureau score from ${outlierBureaus.join(', ')} diverged >2σ from cluster median and was excluded from the credit signal.`,
      source: outlierBureaus.join(', '),
      capApplied: false,
      capCeiling: null,
      observedAt: computedAt,
    })
  }

  const weighted = active.map(b => ({
    value: b.delphiScore as number,
    weight: bureauCoverageWeight(b.coverageMonths),
  }))
  const medianDelphi = weighted.length > 0 ? weightedMedian(weighted) : null

  // Adverse adjustments (§4.4 Step B point 5)
  let adverseAdj = 0
  for (const b of a.bureauScores) {
    adverseAdj += b.writtenOffCount * 5
    if (b.monthlyInstalmentCents !== null) {
      const verifiedIncome = resolveIncome(a).amountCents
      if (verifiedIncome > 0 && b.monthlyInstalmentCents / verifiedIncome > 0.5) adverseAdj += 10
    }
  }
  // VeriCred adverse listings
  const vericred = a.bureauScores.find(b => b.bureau === 'vericred')
  if (vericred?.hasAdverseListings) {
    adverseAdj += Math.min(30, vericred.adverseListingCount * 10)
  }

  // Divergence check (§4.4 Step B point 6)
  const allScores = scoringBureaus.map(b => b.delphiScore as number)
  const divergenceDetected = allScores.length >= 2 &&
    (Math.max(...allScores) - Math.min(...allScores)) > 100

  if (divergenceDetected) {
    confidenceReductions.push(`bureau_divergence_${a.label.replace(' ', '_').toLowerCase()}`)
    flags.push({
      flag: 'bureau_divergence_detected',
      class: 'capping',
      applicantId: a.id,
      applicantLabel: a.label,
      description: `Bureau scores for ${a.label} diverged by more than 100 points. Confidence Index reduced.`,
      source: scoringBureaus.map(b => b.bureau).join(', '),
      capApplied: false,
      capCeiling: null,
      observedAt: computedAt,
    })
  }

  const baseScore = medianDelphi !== null ? delphiToDimensional(medianDelphi) : 0
  const dimensionalScore = Math.max(0, Math.min(100, Math.round(baseScore - adverseAdj)))

  const coverageWeights: Record<string, number> = {}
  const delphiScores: Record<string, number | null> = {}
  for (const b of a.bureauScores) {
    coverageWeights[b.bureau] = bureauCoverageWeight(b.coverageMonths)
    delphiScores[b.bureau] = b.delphiScore
  }

  return {
    dimensionalScore,
    snapshot: {
      responding: a.bureauScores.map(b => b.bureau),
      outliers: outlierBureaus,
      coverageWeights,
      delphiScores,
      weightedMedianDelphi: medianDelphi,
      dimensionalScore,
      adverseAdjustment: adverseAdj,
      divergenceDetected,
    },
  }
}

// ─── Stability per applicant (§2.6) ──────────────────────────────────────────

function tenureScore(m: number): number {
  if (m >= 48) return 100
  if (m >= 24) return 75
  if (m >= 12) return 55
  if (m >= 6) return 35
  if (m >= 3) return 20
  return 0
}

function mobilityScore(moves: number): number {
  if (moves === 0) return 100
  if (moves === 1) return 75
  if (moves === 2) return 50
  return 20
}

function bankLongevityScore(m: number): number {
  if (m >= 60) return 100
  if (m >= 36) return 80
  if (m >= 12) return 60
  return 30
}

function depositConsistencyScore(m: number): number {
  if (m >= 6) return 100
  if (m >= 3) return 70
  return 40
}

function rentalRefsScore(refs: number): number {
  if (refs >= 2) return 100
  if (refs === 1) return 65
  return 40
}

function computeApplicantStability(a: ApplicantInput): { score: number; signalCount: number } {
  const signals: number[] = []

  if (a.employmentTenureMonths !== null) signals.push(tenureScore(a.employmentTenureMonths))
  if (a.addressMoves36Months !== null) signals.push(mobilityScore(a.addressMoves36Months))
  if (a.bankAccountLongevityMonths !== null) signals.push(bankLongevityScore(a.bankAccountLongevityMonths))
  if (a.salaryDepositConsistencyMonths !== null) signals.push(depositConsistencyScore(a.salaryDepositConsistencyMonths))

  signals.push(rentalRefsScore(a.verifiedRentalReferences))

  const score = signals.length > 0
    ? Math.round(signals.reduce((sum, s) => sum + s, 0) / signals.length)
    : 50  // neutral when all signals absent

  return { score, signalCount: signals.length }
}

// ─── Affordability (§2.5) ─────────────────────────────────────────────────────

function computeAffordability(
  totalVerifiedIncomeCents: number,
  proposedRentCents: number,
  totalMonthlyDebtCents: number,
): number {
  if (totalVerifiedIncomeCents <= 0) return 0

  const ratio = proposedRentCents / totalVerifiedIncomeCents

  let score: number
  if (ratio <= 0.25) score = 87        // 80-95 range midpoint
  else if (ratio <= 0.35) score = 69   // 60-79 range midpoint
  else if (ratio <= 0.45) score = 49   // 40-59 range midpoint
  else score = 20                      // <40

  // Debt servicing cap: >35% of income → cap at 50
  const debtRatio = totalMonthlyDebtCents / totalVerifiedIncomeCents
  if (debtRatio > 0.35) score = Math.min(score, 50)

  // Disposable income boost: >1.5× rent
  const disposable = totalVerifiedIncomeCents - totalMonthlyDebtCents - proposedRentCents
  if (disposable > proposedRentCents * 1.5) score = Math.min(100, score + 5)

  return Math.round(score)
}

// ─── Hard flag detection (§§3.3-3.5) ─────────────────────────────────────────

function detectApplicantFlags(
  a: ApplicantInput,
  share: number,
  isPrimary: boolean,
  computedAt: string,
): MaterialFlag[] {
  const flags: MaterialFlag[] = []

  const hasSAFPS = a.bureauScores.some(b => b.hasSAFPS)
  if (hasSAFPS) {
    flags.push({
      flag: 'safps_fraud_match',
      class: 'critical',
      applicantId: a.id,
      applicantLabel: a.label,
      description: `SAFPS fraud listing match for ${a.label}.`,
      source: a.bureauScores.filter(b => b.hasSAFPS).map(b => b.bureau).join(', '),
      capApplied: true,
      capCeiling: 'blocked',
      observedAt: computedAt,
    })
  }

  const hasDebtReview = a.bureauScores.some(b => b.hasDebtReview)
  if (hasDebtReview) {
    const capApplied = share > 0.4
    flags.push({
      flag: 'debt_review_active',
      class: 'capping',
      applicantId: a.id,
      applicantLabel: a.label,
      description: `Debt review or administration order active for ${a.label}${capApplied ? ' (income share >40% — cap applied)' : ' (income share ≤40% — informational)'}`,
      source: a.bureauScores.filter(b => b.hasDebtReview).map(b => b.bureau).join(', '),
      capApplied,
      capCeiling: capApplied ? 'cautious_review' : null,
      observedAt: computedAt,
    })
  }

  const activeJudgment = a.bureauScores.find(b => b.hasActiveJudgment)
  if (activeJudgment) {
    const ageMonths = activeJudgment.judgmentAgeMonths ?? 0
    const capApplied = ageMonths < 24 && (share > 0.4 || isPrimary)
    flags.push({
      flag: 'judgment_active',
      class: 'capping',
      applicantId: a.id,
      applicantLabel: a.label,
      description: `Active court judgment recorded for ${a.label}${capApplied ? ' — cap applied' : ' — informational (aged >24 months)'}`,
      source: activeJudgment.bureau,
      capApplied,
      capCeiling: capApplied ? 'limited_confidence' : null,
      observedAt: computedAt,
    })
  }

  const recentIdReissue = a.bureauScores.find(b => b.idReissueAgeMonths !== null && b.idReissueAgeMonths <= 12)
  if (recentIdReissue) {
    flags.push({
      flag: 'id_reissue_recent',
      class: 'capping',
      applicantId: a.id,
      applicantLabel: a.label,
      description: `ID reissued within last 12 months for ${a.label}.`,
      source: 'vericred',
      capApplied: isPrimary,
      capCeiling: isPrimary ? 'stable_profile' : null,
      observedAt: computedAt,
    })
  }

  if (a.pleksNetworkStatus === 'adverse') {
    const capApplied = isPrimary || share > 0.4
    flags.push({
      flag: 'adverse_pleks_history',
      class: 'capping',
      applicantId: a.id,
      applicantLabel: a.label,
      description: `Adverse Pleks-network rental history found for ${a.label}.`,
      source: 'ADDENDUM_14K',
      capApplied: true,
      capCeiling: capApplied ? 'cautious_review' : 'stable_profile',
      observedAt: computedAt,
    })
  }

  if (a.pleksNetworkStatus === 'trusted') {
    flags.push({
      flag: 'trusted_pleks_network',
      class: 'trust',
      applicantId: a.id,
      applicantLabel: a.label,
      description: `${a.label} trusted by Pleks Network — ${a.pleksNetworkTenancyCount} ${a.pleksNetworkTenancyCount === 1 ? 'tenancy' : 'tenancies'} in good standing.`,
      source: 'ADDENDUM_14K',
      capApplied: false,
      capCeiling: null,
      observedAt: computedAt,
    })
  }

  return flags
}

function detectHardFlags(
  applicants: ApplicantInput[],
  incomeShares: Map<string, number>,
  computedAt: string,
): MaterialFlag[] {
  const primaryId = applicants[0].id
  return applicants.flatMap(a =>
    detectApplicantFlags(a, incomeShares.get(a.id) ?? 0, a.id === primaryId, computedAt)
  )
}

// ─── Lease-level Verification Integrity grade (§2.8) ─────────────────────────

function leaseVIGrade(
  applicantGrades: VerificationIntegrityGrade[],
  hasIdentityFailure: boolean,
): VerificationIntegrityGrade {
  if (hasIdentityFailure) return 'limited'

  const lowOrLimited = applicantGrades.filter(g => g === 'low' || g === 'limited').length
  if (lowOrLimited >= 2) return 'limited'

  const hasLow = applicantGrades.includes('low')
  const hasMedium = applicantGrades.includes('medium')
  const allHigh = applicantGrades.every(g => g === 'high')

  if (allHigh) return 'high'
  if (hasLow) return 'low'
  if (hasMedium) return 'medium'
  return 'high'
}

// ─── Limited Data Profile check (§2.11) ──────────────────────────────────────

function checkLDP(
  applicants: ApplicantInput[],
  hasBureauCredit: boolean,
): { isLDP: boolean; missingSources: string[] } {
  const missing: string[] = []

  // Source 1: Bureau credit (foreign-national-only leases satisfy trivially)
  const allForeign = applicants.every(a => isForeignNational(a.nationalityType))
  if (!allForeign && !hasBureauCredit) missing.push('bureau_credit')

  // Source 2: Bank statement income (Tier 1 or Tier 2 on any applicant)
  const hasVerifiedIncome = applicants.some(a =>
    (a.tier1IncomeCents ?? 0) > 0 || (a.tier2IncomeCents ?? 0) > 0
  )
  if (!hasVerifiedIncome) missing.push('bank_statement_income')

  // Source 3: Employer verification (employer consistency pass on any applicant)
  const hasEmployerVerification = applicants.some(a => a.employerConsistencyStatus === 'pass')
  if (!hasEmployerVerification) missing.push('employer_verification')

  // Source 4: Identity verification (identity match pass on any applicant)
  const hasIdentityVerification = applicants.some(a => a.identityMatchStatus === 'pass')
  if (!hasIdentityVerification) missing.push('identity_verification')

  return { isLDP: missing.length >= 2, missingSources: missing }
}

// ─── Confidence Index (§2.10) ─────────────────────────────────────────────────

function computeConfidence(
  confidenceReductions: string[],
  missingSignals: string[],
  isLDP: boolean,
): ConfidenceGrade {
  if (isLDP) return 'insufficient'

  const reductionCount = confidenceReductions.length + missingSignals.length

  if (reductionCount === 0) return 'high'
  if (reductionCount <= 2) return 'medium'
  return 'low'
}

// ─── Input hash (SHA-256 over canonical input) ────────────────────────────────

export function computeInputsHash(input: EngineInput): string {
  const canonical = {
    applicationId: input.applicationId,
    proposedRentCents: input.proposedRentCents,
    applicants: input.applicants.map(a => ({
      id: a.id,
      nationalityType: a.nationalityType,
      tier1: a.tier1IncomeCents,
      tier2: a.tier2IncomeCents,
      tier3: a.tier3IncomeCents,
      tier4: a.tier4IncomeCents,
      bureauScores: a.bureauScores.map(b => ({
        bureau: b.bureau,
        delphi: b.delphiScore,
        coverageMonths: b.coverageMonths,
        hasSAFPS: b.hasSAFPS,
        hasDebtReview: b.hasDebtReview,
        hasActiveJudgment: b.hasActiveJudgment,
        judgmentAgeMonths: b.judgmentAgeMonths,
        idReissueAgeMonths: b.idReissueAgeMonths,
        adverseListingCount: b.adverseListingCount,
        writtenOffCount: b.writtenOffCount,
        monthlyInstalmentCents: b.monthlyInstalmentCents,
      })),
      checks: {
        identity: a.identityMatchStatus,
        employer: a.employerConsistencyStatus,
        salary: a.salaryReconciliationStatus,
        document: a.documentConsistencyStatus,
        bankOwnership: a.bankOwnershipStatus,
        secondaryReference: a.secondaryReferencePresent,
      },
      stability: {
        tenureMonths: a.employmentTenureMonths,
        addressMoves: a.addressMoves36Months,
        bankLongevity: a.bankAccountLongevityMonths,
        depositConsistency: a.salaryDepositConsistencyMonths,
        rentalRefs: a.verifiedRentalReferences,
      },
      pleksNetwork: { status: a.pleksNetworkStatus, count: a.pleksNetworkTenancyCount },
    })),
  }
  return createHash('sha256').update(JSON.stringify(canonical)).digest('hex')
}

// ─── Main engine function ─────────────────────────────────────────────────────

export function runFitScoreEngine(input: EngineInput): EngineResult {
  const { applicants, proposedRentCents, computedAt } = input
  const flags: MaterialFlag[] = []
  const confidenceReductions: string[] = []

  // Per-applicant processing
  const incomeResolutions = applicants.map(a => resolveIncome(a))
  const totalVerifiedIncomeCents = incomeResolutions.reduce((sum, r) => sum + r.amountCents, 0)

  // Income shares (§4.6 step 4)
  const incomeShares = new Map<string, number>()
  for (let i = 0; i < applicants.length; i++) {
    const share = totalVerifiedIncomeCents > 0
      ? incomeResolutions[i].amountCents / totalVerifiedIncomeCents
      : 1 / applicants.length
    incomeShares.set(applicants[i].id, share)
  }

  // Income variance reconciliation (§4.3) — must run before flag aggregation
  const varianceResults = applicants.map((a, i) =>
    computeIncomeVariance(a, incomeResolutions[i].tier, incomeResolutions[i].amountCents, computedAt)
  )
  for (const vr of varianceResults) flags.push(...vr.flags)

  // Detect hard flags (needs income shares for materiality rules)
  const hardFlags = detectHardFlags(applicants, incomeShares, computedAt)
  flags.push(...hardFlags)

  // Per-applicant dimension scores
  const viResults = applicants.map((a, i) => computeApplicantVI(a, varianceResults[i].viGradeDelta))
  const stabilityResults = applicants.map(a => computeApplicantStability(a))
  const bureauResults = applicants.map(a =>
    processBureau(a, flags, confidenceReductions, computedAt)
  )

  // Aggregate applicant VI adjustments into confidence
  for (const vir of viResults) {
    confidenceReductions.push(...vir.adjustments)
  }

  // Lease-level Verification Integrity (§2.8)
  const hasIdentityFailure = applicants.some(a => a.identityMatchStatus === 'fail')
  const leaseVIGradeValue = leaseVIGrade(
    viResults.map(v => v.grade),
    hasIdentityFailure,
  )

  // Aggregate per-applicant stability via income-weighted median (§2.6)
  const stabilityWeighted = stabilityResults.map((s, i) => ({
    value: s.score,
    weight: incomeShares.get(applicants[i].id) ?? 0,
  }))
  const leaseStabilityScore = Math.round(weightedMedian(stabilityWeighted))

  // Distribution skew boost: ≥80% have >36mo tenure (§2.6)
  const longTenureCount = applicants.filter(a =>
    a.employmentTenureMonths !== null && a.employmentTenureMonths > 36
  ).length
  const stabilityBoost = longTenureCount / applicants.length >= 0.8 ? 5 : 0

  // Weakest-link floor: <3mo tenure + >40% income share (§2.6)
  const hasWeakestLink = applicants.some(a =>
    a.employmentTenureMonths !== null &&
    a.employmentTenureMonths < 3 &&
    (incomeShares.get(a.id) ?? 0) > 0.4
  )
  const stabilityFloorAdj = hasWeakestLink ? -15 : 0

  const leaseSta = Math.max(0, Math.min(100, leaseStabilityScore + stabilityBoost + stabilityFloorAdj))

  // Lease-level Credit Behaviour: income-weighted mean, SA applicants only (§2.7 Step C / §4.6)
  const saShare = applicants.reduce((sum, a) =>
    isForeignNational(a.nationalityType) ? sum : sum + (incomeShares.get(a.id) ?? 0), 0)
  const leaseCre = saShare > 0
    ? Math.round(applicants.reduce((sum, a, i) => {
        if (isForeignNational(a.nationalityType)) return sum
        return sum + bureauResults[i].dimensionalScore * (incomeShares.get(a.id) ?? 0)
      }, 0) / saShare)
    : 0

  // Lease-level Verification Integrity dimensional score: income-weighted mean
  const leaseVIScore = Math.round(
    viResults.reduce((sum, v, i) => sum + v.score * (incomeShares.get(applicants[i].id) ?? 0), 0)
  )

  // Affordability (lease-level, §2.5)
  const totalMonthlyDebtCents = applicants.reduce((sum, a) =>
    sum + a.bureauScores.reduce((dsum, b) => dsum + (b.monthlyInstalmentCents ?? 0), 0), 0
  )
  const leaseAff = computeAffordability(totalVerifiedIncomeCents, proposedRentCents, totalMonthlyDebtCents)

  // Per-applicant weighted composite (§4.6 steps 2-3)
  const hasBureauCredit = applicants.some(a => a.bureauScores.some(b => b.delphiScore !== null))
  const { isLDP, missingSources } = checkLDP(applicants, hasBureauCredit)

  const applicantSnapshots: ApplicantSnapshot[] = []
  let rawComposite = 0

  for (let i = 0; i < applicants.length; i++) {
    const a = applicants[i]
    const weights = compositeWeights(a.nationalityType)
    const share = incomeShares.get(a.id) ?? 0

    const applicantComposite =
      leaseAff    * weights.affordability +
      leaseSta    * weights.stability +
      leaseCre    * weights.creditBehaviour +
      leaseVIScore * weights.verificationIntegrity

    rawComposite += applicantComposite * share

    applicantSnapshots.push({
      id: a.id,
      label: a.label,
      nationalityType: a.nationalityType,
      isForeignNational: isForeignNational(a.nationalityType),
      incomeTier: incomeResolutions[i].tier,
      verifiedIncomeCents: incomeResolutions[i].amountCents,
      incomeSharePct: Math.round(share * 100 * 10) / 10,
      verificationIntegrityScore: viResults[i].score,
      verificationIntegrityGrade: viResults[i].grade,
      incomeVarianceViGradeDelta: varianceResults[i].viGradeDelta,
      viAdjustmentsApplied: viResults[i].adjustments,
      bureauProcessing: bureauResults[i].snapshot,
      stabilityScore: stabilityResults[i].score,
      stabilitySignalCount: stabilityResults[i].signalCount,
      compositeWeighted: Math.round(applicantComposite * 10) / 10,
      compositeWeights: weights,
      flagsDetected: hardFlags.filter(f => f.applicantId === a.id).map(f => f.flag),
    })
  }

  const composite = Math.round(rawComposite)
  const confidence = computeConfidence(confidenceReductions, missingSources, isLDP)

  // Band assignment
  let band: FitScoreBand = isLDP ? 'limited_data_profile' : assignBand(composite)

  // Blocked by Critical flags
  if (flags.some(f => f.class === 'critical')) band = 'blocked'

  const bandBeforeCaps = band

  // Verification Integrity multiplier cap (§2.8)
  const viCap = VI_BAND_CAP[leaseVIGradeValue]
  if (viCap !== null && band !== 'blocked' && band !== 'limited_data_profile') {
    band = capBand(band, viCap)
  }

  // Capping-class hard flag caps (§3.4)
  for (const f of flags) {
    if (f.class === 'capping' && f.capApplied && f.capCeiling && band !== 'blocked' && band !== 'limited_data_profile') {
      band = capBand(band, f.capCeiling)
    }
  }

  const leaseSnapshot: LeaseSnapshot = {
    totalVerifiedIncomeCents,
    proposedRentCents,
    rentToIncomeRatio: totalVerifiedIncomeCents > 0
      ? Math.round((proposedRentCents / totalVerifiedIncomeCents) * 1000) / 1000
      : 0,
    affordabilityScore: leaseAff,
    stabilityScore: leaseSta,
    creditBehaviourScore: leaseCre,
    verificationIntegrityDimensionalScore: leaseVIScore,
    leaseVerificationIntegrityGrade: leaseVIGradeValue,
    verificationIntegrityCap: viCap,
    rawComposite: composite,
    isLimitedDataProfile: isLDP,
    ldpMissingSignals: missingSources,
    confidenceGrade: confidence,
    confidenceReductions,
    hardFlagsApplied: flags.filter(f => f.capApplied).map(f => f.flag),
    bandBeforeCaps,
    finalBand: band,
  }

  const snapshot: ComponentSnapshot = {
    engineVersion: ENGINE_VERSION,
    applicants: applicantSnapshots,
    lease: leaseSnapshot,
  }

  const isAllForeign = applicants.every(a => isForeignNational(a.nationalityType))

  return {
    score: band === 'limited_data_profile' || band === 'blocked' ? null : composite,
    band,
    confidenceIndex: confidence,
    verificationIntegrity: leaseVIGradeValue,
    materialFlags: flags,
    components: {
      affordability: leaseAff,
      stability: leaseSta,
      creditBehaviour: leaseCre,
      verificationIntegrity: leaseVIScore,
    },
    preferredThresholds: getPreferredThresholds(isAllForeign),
    engineVersion: ENGINE_VERSION,
    inputsHash: computeInputsHash(input),
    componentSnapshot: snapshot,
  }
}
