/**
 * lib/screening/preScreenScore.ts — compute the pre-SearchWorx partial FitScore from income-to-rent ratio, employment type, and reference count
 *
 * Notes:  partial score is out of 45 (income 25% + employment 15% + refs 5%) — the credit-bureau components fill the rest; affordability flag trips when rent/income exceeds INCOME_AFFORDABILITY_THRESHOLD.
 */
import { INCOME_AFFORDABILITY_THRESHOLD } from "@/lib/constants"

export interface PreScreenResult {
  prescreenScore: number
  incomeScore: number
  employmentScore: number
  refsScore: number
  affordabilityFlag: boolean
  ratio: number | null
}

const EMPLOYMENT_SCORE_MAP: Record<string, number> = {
  permanent: 100,
  contract: 70,
  self_employed: 60,
  retired: 80,
  student: 40,
  unemployed: 0,
  other: 50,
}

export function calculatePreScreenScore(
  incomeCents: number | null,
  rentCents: number,
  employmentType: string | null,
  referenceCount: number,
  threshold: number = INCOME_AFFORDABILITY_THRESHOLD
): PreScreenResult {
  // Income-to-rent ratio (25% weight)
  // The 0.25/0.30/0.35/0.40 ladder is the FitScore INCOME SUB-SCORE CURVE, not the affordability
  // ceiling, and it is deliberately left fixed: threading the org threshold into one rung only would
  // let the rungs cross (a 0.28 policy would order them 0.25 / 0.28 / 0.35). The ceiling decides the
  // FLAG and the LABEL; this decides how much of 25 points the ratio earns.
  const ratio = incomeCents && incomeCents > 0 ? rentCents / incomeCents : null
  let incomeScore = 0
  if (ratio !== null) {
    if (ratio <= 0.25) incomeScore = 100
    else if (ratio <= 0.30) incomeScore = 80
    else if (ratio <= 0.35) incomeScore = 50
    else if (ratio <= 0.40) incomeScore = 25
    // else: incomeScore stays 0 (initialised above)
  }

  // Employment stability (15% weight)
  const employmentScore = EMPLOYMENT_SCORE_MAP[employmentType ?? "other"] ?? 50

  // References (5% weight)
  let refsScore = 0
  if (referenceCount >= 2) refsScore = 100
  else if (referenceCount === 1) refsScore = 60

  // Partial score out of 45 max (25% + 15% + 5%)
  const prescreenScore = Math.round(
    incomeScore * 0.25 + employmentScore * 0.15 + refsScore * 0.05
  )

  const affordabilityFlag = ratio !== null && ratio > threshold

  return { prescreenScore, incomeScore, employmentScore, refsScore, affordabilityFlag, ratio }
}

export type PreScreenIndicator = "strong" | "borderline" | "insufficient" | "pending"

/**
 * The applicant-facing label. `threshold` is the same org ceiling the flag above uses.
 *
 * It was a bare `0.30` while the flag five lines up used the constant — so within ONE file the flag
 * followed the SSOT and the label the applicant reads did not. An org authoring 0.35 showed
 * "insufficient" to an applicant its own policy considers affordable.
 *
 * The 0.40 "borderline" edge is deliberately NOT threaded: it is the far edge of a fixed label ladder,
 * not the affordability ceiling, and moving only the near edge would let the two cross.
 */
export function getPreScreenIndicator(
  ratio: number | null,
  threshold: number = INCOME_AFFORDABILITY_THRESHOLD,
): PreScreenIndicator {
  if (ratio === null) return "pending"
  if (ratio <= threshold) return "strong"
  if (ratio <= 0.40) return "borderline"
  return "insufficient"
}
