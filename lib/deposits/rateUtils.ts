// Client-safe utilities for deposit interest rate display.
// No server imports — safe to use in client components.

export interface DepositInterestConfig {
  id: string
  org_id: string
  property_id: string | null
  unit_id: string | null
  rate_type: "fixed" | "prime_linked" | "repo_linked" | "manual"
  fixed_rate_percent: number | null
  prime_offset_percent: number | null
  repo_offset_percent: number | null
  compounding: "daily" | "monthly"
  bank_name: string | null
  account_reference: string | null
  effective_from: string
  effective_to: string | null
}

/**
 * Describe the rate in human-readable form.
 * Pure function — no DB access — safe in client components.
 */
export function describeRate(config: DepositInterestConfig, currentPrime?: number | null): string {
  if (config.rate_type === "fixed") {
    return `Fixed ${config.fixed_rate_percent?.toFixed(2) ?? "—"}% p.a.`
  }
  if (config.rate_type === "manual") {
    return "Manual (entered per period)"
  }
  if (config.rate_type === "prime_linked") {
    const offset = config.prime_offset_percent ?? 0
    const sign = offset >= 0 ? "+" : ""
    const effectivePart =
      currentPrime != null
        ? ` = ${(currentPrime + offset).toFixed(2)}% (at prime ${currentPrime.toFixed(2)}%)`
        : ""
    return `Prime ${sign}${offset.toFixed(2)}%${effectivePart}`
  }
  if (config.rate_type === "repo_linked") {
    const offset = config.repo_offset_percent ?? 0
    const sign = offset >= 0 ? "+" : ""
    return `Repo ${sign}${offset.toFixed(2)}%`
  }
  return "—"
}
