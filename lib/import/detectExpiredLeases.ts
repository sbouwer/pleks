/**
 * lib/import/detectExpiredLeases.ts — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
import { normaliseDate } from "./normalise"

export interface ExpiredLeaseResult {
  /** Row indices with expired (past) lease end dates */
  expiredIndices: number[]
  /** Row indices that are active (future end date or no end date / month-to-month) */
  activeIndices: number[]
}

/**
 * Detect which rows have expired vs active leases.
 *
 * - null/blank end_date = active (month-to-month)
 * - future end_date = active
 * - past end_date = expired
 */
export function detectExpiredLeases(
  rows: Record<string, string>[],
  endDateField: string
): ExpiredLeaseResult {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const expiredIndices: number[] = []
  const activeIndices: number[] = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!
    const rawEndDate = (row[endDateField] ?? "").trim()

    // No end date = month-to-month = active
    if (!rawEndDate) {
      activeIndices.push(i)
      continue
    }

    const normalised = normaliseDate(rawEndDate)

    // Couldn't parse = treat as active (don't discard data)
    if (!normalised) {
      activeIndices.push(i)
      continue
    }

    const endDate = new Date(normalised)
    endDate.setHours(0, 0, 0, 0)

    if (endDate < today) {
      expiredIndices.push(i)
    } else {
      activeIndices.push(i)
    }
  }

  return { expiredIndices, activeIndices }
}
