import { differenceInMonths } from "date-fns"

export function getDepositRecommendation(
  isForeignNational: boolean,
  nationalityType: string | null,
  permitExpiryDate: Date | null
): {
  recommendedMonths: number
  reason: string
} {
  if (!isForeignNational) {
    return { recommendedMonths: 1, reason: "Standard residential deposit" }
  }

  // Asylum seekers / Section 22: highest risk
  if (nationalityType === "asylum_seeker") {
    return {
      recommendedMonths: 3,
      reason: "Section 22 permit holders cannot be negatively listed on TPN. 3-month deposit recommended as risk mitigation.",
    }
  }

  // Permit expiring within 12 months
  if (permitExpiryDate) {
    const monthsToExpiry = differenceInMonths(permitExpiryDate, new Date())
    if (monthsToExpiry < 12) {
      return {
        recommendedMonths: 3,
        reason: `Permit expires in ${monthsToExpiry} months. 3-month deposit recommended given permit renewal uncertainty.`,
      }
    }
  }

  return {
    recommendedMonths: 2,
    reason: "Foreign nationals cannot be negatively listed on TPN. 2-month deposit recommended as standard risk mitigation.",
  }
}
