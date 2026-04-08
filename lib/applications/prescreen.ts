/**
 * Pre-screen scoring engine.
 * 45-point scale: income (25pts) + employment (15pts) + references (5pts).
 * Runs automatically when documents are submitted.
 */

export interface PrescreenResult {
  income: number        // 0-25
  employment: number    // 0-15
  references: number    // 0-5
  total: number         // 0-45
  affordability_flag: boolean
  rent_to_income_pct: number | null
}

export type PrescreenLevel = "strong" | "good" | "borderline" | "insufficient" | "pending"

export function calculatePrescreen(
  grossMonthlyIncomeCents: number | null,
  askingRentCents: number,
  employmentType: string | null,
  bankStatementAvgIncomeCents: number | null,
  hasLandlordReference: boolean,
  hasReasonForMoving: boolean
): PrescreenResult {
  const rentCents = askingRentCents

  // ── Income score (0-25) ────────────────────────────────────────────────────
  const incomeCents = grossMonthlyIncomeCents ?? 0
  const ratio = incomeCents > 0 ? incomeCents / rentCents : 0
  let income = 0

  if (ratio >= 4.0) income = 25       // excellent
  else if (ratio >= 3.33) income = 22  // good — meets minimum
  else if (ratio >= 3.0) income = 18   // acceptable
  else if (ratio >= 2.5) income = 12   // tight
  else if (ratio > 0) income = 5       // concerning

  // Bank statement cross-check bonus (+3, capped at 25)
  if (bankStatementAvgIncomeCents && incomeCents > 0) {
    const discrepancy = Math.abs(bankStatementAvgIncomeCents - incomeCents) / incomeCents
    if (discrepancy < 0.15) {
      income = Math.min(25, income + 3)
    }
  }

  // ── Employment score (0-15) ────────────────────────────────────────────────
  const EMPLOYMENT_MAP: Record<string, number> = {
    permanent:     15,
    retired:       12,
    contract:      10,
    self_employed: 8,
    full_time:     15,
    part_time:     8,
    contractor:    10,
    student:       5,
    unemployed:    3,
    other:         5,
  }
  const employment = EMPLOYMENT_MAP[employmentType ?? "other"] ?? 5

  // ── References score (0-5) ────────────────────────────────────────────────
  let references = 0
  if (hasLandlordReference) references += 3
  if (hasReasonForMoving) references += 2

  const total = income + employment + references
  const affordability_flag = ratio > 0 && ratio < 3.0  // below 3× rent is a flag
  const rent_to_income_pct = incomeCents > 0 ? (rentCents / incomeCents) * 100 : null

  return { income, employment, references, total, affordability_flag, rent_to_income_pct }
}

export function getPrescreenLevel(total: number): PrescreenLevel {
  if (total >= 38) return "strong"
  if (total >= 30) return "good"
  if (total >= 22) return "borderline"
  if (total > 0)   return "insufficient"
  return "pending"
}

export function getPrescreenLabel(level: PrescreenLevel): string {
  switch (level) {
    case "strong":      return "Strong"
    case "good":        return "Good"
    case "borderline":  return "Borderline"
    case "insufficient": return "Insufficient"
    default:            return "Pending"
  }
}
