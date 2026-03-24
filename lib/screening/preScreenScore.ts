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
  referenceCount: number
): PreScreenResult {
  // Income-to-rent ratio (25% weight)
  const ratio = incomeCents && incomeCents > 0 ? rentCents / incomeCents : null
  let incomeScore = 0
  if (ratio !== null) {
    if (ratio <= 0.25) incomeScore = 100
    else if (ratio <= 0.30) incomeScore = 80
    else if (ratio <= 0.35) incomeScore = 50
    else if (ratio <= 0.40) incomeScore = 25
    else incomeScore = 0
  }

  // Employment stability (15% weight)
  const employmentScore = EMPLOYMENT_SCORE_MAP[employmentType ?? "other"] ?? 50

  // References (5% weight)
  const refsScore = referenceCount >= 2 ? 100 : referenceCount === 1 ? 60 : 0

  // Partial score out of 45 max (25% + 15% + 5%)
  const prescreenScore = Math.round(
    incomeScore * 0.25 + employmentScore * 0.15 + refsScore * 0.05
  )

  const affordabilityFlag = ratio !== null && ratio > INCOME_AFFORDABILITY_THRESHOLD

  return { prescreenScore, incomeScore, employmentScore, refsScore, affordabilityFlag, ratio }
}

export type PreScreenIndicator = "strong" | "borderline" | "insufficient" | "pending"

export function getPreScreenIndicator(ratio: number | null): PreScreenIndicator {
  if (ratio === null) return "pending"
  if (ratio <= 0.30) return "strong"
  if (ratio <= 0.40) return "borderline"
  return "insufficient"
}
