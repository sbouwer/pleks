export interface FitScoreComponents {
  credit_score: { raw: number | null; score: number; weight: number }
  income_to_rent: { ratio: number | null; score: number; weight: number }
  rental_history: { rating: string | null; score: number; weight: number }
  employment_stability: { type: string | null; score: number; weight: number }
  judgements: { count: number; score: number; weight: number }
  references: { count: number; score: number; weight: number }
}

const EMPLOYMENT_SCORE: Record<string, number> = {
  permanent: 100, contract: 70, self_employed: 60,
  retired: 80, student: 40, unemployed: 0, other: 50,
}

const EMPLOYMENT_SCORE_FOREIGN: Record<string, number> = {
  permanent: 100, contract: 70, self_employed: 60,
  retired: 80, student: 40, unemployed: 20, other: 50,
}

const RENTAL_HISTORY_SCORE: Record<string, number> = {
  good_standing: 100, satisfactory: 70, poor: 20, no_record: 50,
}

export function calculateFullFitScore(
  creditScore: number | null,
  incomeCents: number | null,
  rentCents: number,
  tpnRating: string | null,
  employmentType: string | null,
  judgementsCount: number,
  adverseCount: number,
  referenceCount: number,
  isForeignNational: boolean
): { total: number; components: FitScoreComponents; affordabilityFlag: boolean } {
  const empMap = isForeignNational ? EMPLOYMENT_SCORE_FOREIGN : EMPLOYMENT_SCORE

  // 1. Credit score (25%)
  let creditScoreValue = 50 // neutral for thin file
  if (creditScore !== null) {
    if (creditScore >= 700) creditScoreValue = 100
    else if (creditScore >= 650) creditScoreValue = 80
    else if (creditScore >= 600) creditScoreValue = 60
    else if (creditScore >= 550) creditScoreValue = 40
    else if (creditScore >= 500) creditScoreValue = 20
    else creditScoreValue = 0
  }

  // 2. Income-to-rent (25%)
  const ratio = incomeCents && incomeCents > 0 ? rentCents / incomeCents : null
  let incomeScore = 0
  if (ratio !== null) {
    if (ratio <= 0.25) incomeScore = 100
    else if (ratio <= 0.30) incomeScore = 80
    else if (ratio <= 0.35) incomeScore = 50
    else if (ratio <= 0.40) incomeScore = 25
    // else: incomeScore stays 0 (initialised above)
  }

  // 3. TPN rental history (20%)
  const rentalScore = RENTAL_HISTORY_SCORE[tpnRating ?? "no_record"] ?? 50

  // 4. Employment (15%)
  const empScore = empMap[employmentType ?? "other"] ?? 50

  // 5. Judgements & adverse (10%)
  const totalAdverse = judgementsCount + adverseCount
  let judgementScore: number
  if (totalAdverse === 0) { judgementScore = 100 }
  else if (totalAdverse === 1) { judgementScore = 30 }
  else { judgementScore = 0 }

  // 6. References (5%)
  let refScore: number
  if (referenceCount >= 2) { refScore = 100 }
  else if (referenceCount === 1) { refScore = 60 }
  else { refScore = 0 }

  const components: FitScoreComponents = {
    credit_score: { raw: creditScore, score: creditScoreValue, weight: 0.25 },
    income_to_rent: { ratio, score: incomeScore, weight: 0.25 },
    rental_history: { rating: tpnRating, score: rentalScore, weight: 0.20 },
    employment_stability: { type: employmentType, score: empScore, weight: 0.15 },
    judgements: { count: totalAdverse, score: judgementScore, weight: 0.10 },
    references: { count: referenceCount, score: refScore, weight: 0.05 },
  }

  const total = Math.round(
    creditScoreValue * 0.25 +
    incomeScore * 0.25 +
    rentalScore * 0.20 +
    empScore * 0.15 +
    judgementScore * 0.10 +
    refScore * 0.05
  )

  return { total, components, affordabilityFlag: ratio !== null && ratio > 0.30 }
}
