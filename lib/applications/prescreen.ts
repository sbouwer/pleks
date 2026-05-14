/**
 * lib/applications/prescreen.ts — BUILD_14 v2 deterministic prescreen engine (45-point scale)
 *
 * Auth:   internal (called from server actions, never exposed to clients)
 * Data:   application row + bank statement classifications + document list
 * Notes:  Pure functions only — no DB access here. Callers persist the result
 *         to application_prescreens and update applications.prescreen_score.
 *         Ratio 2 uses classified debits from application_bank_statement_classifications.
 *         Capital path (§5 ADDENDUM_14D) takes max(income score, capital score).
 *         Prescreen is iterative — each run adds a new row with iteration_number++.
 */

export type PrescreenFlag = 'green' | 'yellow' | 'red'
export type AffordabilitySource = 'income' | 'capital' | 'hybrid'
export type IdentityMatch = 'exact' | 'variant' | 'mismatch' | 'unable_to_extract' | 'not_checked'

// ── Ratio 1: Affordability (income path) ────────────────────────────────────
// rent / income — lower is better
function incomeAffordabilityScore(rentCents: number, incomeCents: number): number {
  const ratio = rentCents / incomeCents
  if (ratio <= 0.25) return 25
  if (ratio <= 0.28) return 22
  if (ratio <= 0.3)  return 18
  if (ratio <= 0.33) return 14
  if (ratio <= 0.4)  return 8
  if (ratio <= 0.5)  return 3
  return 0
}

// ── Ratio 1: Affordability (capital coverage path) ──────────────────────────
// capital_cents / rent_cents = months covered
function capitalAffordabilityScore(capitalCents: number, rentCents: number): {
  score: number
  months: number
} {
  const months = Math.floor(capitalCents / rentCents)
  let score: number
  if (months >= 36) score = 25
  else if (months >= 24) score = 22
  else if (months >= 12) score = 18
  else if (months >= 6)  score = 12
  else if (months >= 3)  score = 6
  else score = 0
  return { score, months }
}

// ── Ratio 2: Commitments score ───────────────────────────────────────────────
function commitmentsScore(commitmentsCents: number, incomeCents: number): number {
  if (incomeCents <= 0) return 0
  const ratio = commitmentsCents / incomeCents
  if (ratio <= 0.2)  return 15
  if (ratio <= 0.3)  return 12
  if (ratio <= 0.4)  return 9
  if (ratio <= 0.55) return 5
  if (ratio <= 0.7)  return 2
  return 0
}

// ── Document completeness score ──────────────────────────────────────────────
const REQUIRED_DOCS_STANDARD = [
  'id_document',
  'payslip_x3',
  'bank_statement_x3',
  'employment_letter',
] as const

export function documentsScore(submittedDocs: string[], requiredDocs: string[] = [...REQUIRED_DOCS_STANDARD]): {
  score: number
  missing: string[]
} {
  const submitted = new Set(submittedDocs)
  const missing = requiredDocs.filter((d) => !submitted.has(d))
  const presentCount = requiredDocs.length - missing.length
  const score = Math.round((presentCount / requiredDocs.length) * 5)
  return { score, missing }
}

// ── Identity score ───────────────────────────────────────────────────────────
function identityScore(match: IdentityMatch): { score: number; requiresReview: boolean } {
  switch (match) {
    case 'exact':              return { score: 5, requiresReview: false }
    case 'variant':            return { score: 4, requiresReview: false }
    case 'mismatch':           return { score: 0, requiresReview: true }
    case 'unable_to_extract':  return { score: 2, requiresReview: true }
    case 'not_checked':        return { score: 0, requiresReview: false }
  }
}

// ── Flag bands ───────────────────────────────────────────────────────────────
function flagFromScore(total: number): PrescreenFlag {
  if (total >= 35) return 'green'
  if (total >= 20) return 'yellow'
  return 'red'
}

export interface PrescreenInput {
  rentCents: number

  // Income path
  incomeCents: number | null

  // Capital path (ADDENDUM_14D §5)
  capitalCents: number | null

  // Commitments (classified recurring debits, already summed)
  classifiedCommitmentsCents: number
  unclassifiedDebitsCount: number
  currentRentMatched: boolean | null

  // Identity
  identityMatch: IdentityMatch

  // Documents
  submittedDocs: string[]
  requiredDocs?: string[]

  // Pleks-internal signal
  isPriorPleksTenant: boolean
  pleksPaymentQuality: 'strong' | 'good' | 'mixed' | 'poor' | null
}

export interface PrescreenResult {
  // Component scores
  affordabilityScore: number      // 0-25
  affordabilitySource: AffordabilitySource
  incomeCents: number | null
  incomeToRentRatio: number | null
  capitalCoverageCents: number | null
  capitalCoverageMonths: number | null
  commitmentsScore: number        // 0-15
  classifiedCommitmentsCents: number
  currentRentMatched: boolean | null
  unclassifiedDebitsCount: number
  identityScore: number           // 0-5
  identityMatch: IdentityMatch
  identityRequiresReview: boolean
  documentsScore: number          // 0-5
  missingRequiredDocs: string[]
  pleksBonus: number              // 0 or +5
  isPriorPleksTenant: boolean
  pleksPaymentQuality: string | null

  // Totals
  totalScore: number              // 0-55 (25 affordability + 15 commitments + 5 identity + 5 documents + 5 Pleks bonus)
  flag: PrescreenFlag

  // Narratives (selected from templates in prescreenNarratives.ts)
  // Callers pass the result to prescreenNarratives.selectNarrative()
}

export function runPrescreen(input: PrescreenInput): PrescreenResult {
  const {
    rentCents,
    incomeCents,
    capitalCents,
    classifiedCommitmentsCents,
    unclassifiedDebitsCount,
    currentRentMatched,
    identityMatch,
    submittedDocs,
    requiredDocs,
    isPriorPleksTenant,
    pleksPaymentQuality,
  } = input

  // ── Ratio 1: best of income vs capital ──────────────────────────────────
  let incomeScore = 0
  let incomeToRentRatio: number | null = null
  if (incomeCents && incomeCents > 0) {
    incomeScore = incomeAffordabilityScore(rentCents, incomeCents)
    incomeToRentRatio = rentCents / incomeCents
  }

  let capScore = 0
  let capitalCoverageMonths: number | null = null
  if (capitalCents && capitalCents > 0) {
    const cap = capitalAffordabilityScore(capitalCents, rentCents)
    capScore = cap.score
    capitalCoverageMonths = cap.months
  }

  let affordabilityScore: number
  let affordabilitySource: AffordabilitySource
  if (incomeScore > 0 && capScore > 0) {
    affordabilityScore = Math.max(incomeScore, capScore)
    affordabilitySource = incomeScore >= capScore ? 'income' : 'capital'
  } else if (incomeScore > 0) {
    affordabilityScore = incomeScore
    affordabilitySource = 'income'
  } else if (capScore > 0) {
    affordabilityScore = capScore
    affordabilitySource = 'capital'
  } else {
    affordabilityScore = 0
    affordabilitySource = 'income'
  }

  // ── Ratio 2: commitments ────────────────────────────────────────────────
  // current rent is suppressed if matched (it terminates on move)
  const effectiveIncome = incomeCents ?? 0
  const commitments = commitmentsScore(classifiedCommitmentsCents, effectiveIncome)

  // ── Identity ────────────────────────────────────────────────────────────
  const { score: idScore, requiresReview } = identityScore(identityMatch)

  // ── Documents ───────────────────────────────────────────────────────────
  const { score: docsScore, missing: missingDocs } = documentsScore(submittedDocs, requiredDocs)

  // ── Pleks-internal bonus ────────────────────────────────────────────────
  // Positive history = +5 bonus; negative = flag only (no subtraction)
  const pleksBonus =
    isPriorPleksTenant &&
    (pleksPaymentQuality === 'strong' || pleksPaymentQuality === 'good')
      ? 5
      : 0

  const totalScore = affordabilityScore + commitments + idScore + docsScore + pleksBonus

  return {
    affordabilityScore,
    affordabilitySource,
    incomeCents: incomeCents ?? null,
    incomeToRentRatio,
    capitalCoverageCents: capitalCents ?? null,
    capitalCoverageMonths,
    commitmentsScore: commitments,
    classifiedCommitmentsCents,
    currentRentMatched: currentRentMatched ?? null,
    unclassifiedDebitsCount,
    identityScore: idScore,
    identityMatch,
    identityRequiresReview: requiresReview,
    documentsScore: docsScore,
    missingRequiredDocs: missingDocs,
    pleksBonus,
    isPriorPleksTenant,
    pleksPaymentQuality: pleksPaymentQuality ?? null,
    totalScore,
    flag: flagFromScore(totalScore),
  }
}

/**
 * Phase 1 backward-compat shim. Kept alive during the BUILD_14 v2 parallel-run
 * period (§11 of BUILD_14_SEARCHWORX_FITSCORE.md). Remove after cutover + 30 days.
 */
export function calculatePrescreen(
  grossMonthlyIncomeCents: number | null,
  askingRentCents: number,
  employmentType: string | null,
  bankStatementAvgIncomeCents: number | null,
  hasLandlordReference: boolean,
  hasReasonForMoving: boolean,
): { income: number; employment: number; references: number; total: number; affordability_flag: boolean; rent_to_income_pct: number | null } {
  const EMPLOYMENT_MAP: Record<string, number> = {
    permanent: 15, retired: 12, contract: 10, self_employed: 8,
    full_time: 15, part_time: 8, contractor: 10, student: 5, unemployed: 3, other: 5,
  }
  const incomeCents = bankStatementAvgIncomeCents ?? grossMonthlyIncomeCents
  const result = runPrescreen({
    rentCents: askingRentCents,
    incomeCents,
    capitalCents: null,
    classifiedCommitmentsCents: 0,
    unclassifiedDebitsCount: 0,
    currentRentMatched: null,
    identityMatch: 'not_checked',
    submittedDocs: [],
    isPriorPleksTenant: false,
    pleksPaymentQuality: null,
  })
  const employment = EMPLOYMENT_MAP[employmentType ?? 'other'] ?? 5
  const references = (hasLandlordReference ? 3 : 0) + (hasReasonForMoving ? 2 : 0)
  const income = result.affordabilityScore
  const total = Math.min(45, income + employment + references)
  const rent_to_income_pct = incomeCents && incomeCents > 0 ? (askingRentCents / incomeCents) * 100 : null
  return { income, employment, references, total, affordability_flag: result.flag !== 'green', rent_to_income_pct }
}

/**
 * v1-scale only — thresholds calibrated to 0-45. Do NOT pass v2 totalScore (0-55) here;
 * use flagFromScore (above) or a future getPrescreenLevelV2 for v2 results.
 * Kept for Phase 1 parallel-run callers. Remove after v2 cutover.
 */
export function getPrescreenLevel(total: number): 'strong' | 'good' | 'borderline' | 'insufficient' | 'pending' {
  if (total >= 38) return 'strong'
  if (total >= 30) return 'good'
  if (total >= 22) return 'borderline'
  if (total > 0)   return 'insufficient'
  return 'pending'
}
