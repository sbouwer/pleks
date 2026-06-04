/**
 * lib/leases/rentRoll.ts — single source of truth for which lease statuses count toward rent roll
 *
 * Notes:  "Rent roll" = the monthly recurring rent from leases currently IN FORCE — active,
 *         month-to-month, and notice (a lease on notice is still earning rent until it ends).
 *         Used by the properties list (per-unit rent roll) and the leases list KPI so both show
 *         the SAME figure. Don't compute rent roll from `status === "active"` alone — that
 *         under-counts MTM + notice tenancies.
 */
export const IN_FORCE_LEASE_STATUSES = ["active", "month_to_month", "notice"] as const

export function isInForceLease(status: string): boolean {
  return (IN_FORCE_LEASE_STATUSES as readonly string[]).includes(status)
}
