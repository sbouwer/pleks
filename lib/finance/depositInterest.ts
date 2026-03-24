import { differenceInDays } from "date-fns"

export function calculateDepositInterest(
  depositCents: number,
  annualRatePercent: number,
  fromDate: Date,
  toDate: Date
): number {
  const days = differenceInDays(toDate, fromDate)
  if (days <= 0) return 0
  const dailyRate = annualRatePercent / 100 / 365
  return Math.floor(depositCents * dailyRate * days)
}
