import { createServiceClient } from "@/lib/supabase/server"

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
 * Resolve the deposit interest config for a given lease context.
 * Hierarchy: unit → property → org default
 * Returns null if no config found (interest should not be auto-accrued).
 */
export async function resolveDepositInterestConfig(
  orgId: string,
  propertyId: string | null,
  unitId: string | null,
  asOfDate: string
): Promise<DepositInterestConfig | null> {
  const supabase = await createServiceClient()

  // Build scope candidates from most specific to least specific
  const candidates: { property_id: string | null; unit_id: string | null }[] = []
  if (unitId) candidates.push({ property_id: propertyId, unit_id: unitId })
  if (propertyId) candidates.push({ property_id: propertyId, unit_id: null })
  candidates.push({ property_id: null, unit_id: null })

  for (const scope of candidates) {
    let query = supabase
      .from("deposit_interest_config")
      .select("*")
      .eq("org_id", orgId)
      .lte("effective_from", asOfDate)
      .or(`effective_to.is.null,effective_to.gte.${asOfDate}`)

    if (scope.unit_id) {
      query = query.eq("unit_id", scope.unit_id)
    } else {
      query = query.is("unit_id", null)
    }

    if (scope.property_id) {
      query = query.eq("property_id", scope.property_id)
    } else {
      query = query.is("property_id", null)
    }

    const { data } = await query.order("effective_from", { ascending: false }).limit(1).single()

    if (data) return data as DepositInterestConfig
  }

  return null
}

/**
 * Get the latest prime rate on or before the given date.
 */
export async function getPrimeRateOn(date: string): Promise<number | null> {
  const supabase = await createServiceClient()
  const { data } = await supabase
    .from("prime_rates")
    .select("rate_percent")
    .lte("effective_date", date)
    .order("effective_date", { ascending: false })
    .limit(1)
    .single()
  return data?.rate_percent ?? null
}

/**
 * Resolve the effective annual rate percent for a config on a given date.
 * Returns null for manual mode (interest not auto-calculated).
 */
export async function resolveEffectiveRate(
  config: DepositInterestConfig,
  date: string
): Promise<number | null> {
  if (config.rate_type === "fixed") {
    return config.fixed_rate_percent
  }
  if (config.rate_type === "manual") {
    return null
  }

  const prime = await getPrimeRateOn(date)
  if (prime === null) return null

  if (config.rate_type === "prime_linked") {
    return prime + (config.prime_offset_percent ?? 0)
  }
  if (config.rate_type === "repo_linked") {
    const repo = prime - 3.5
    return repo + (config.repo_offset_percent ?? 0)
  }

  return null
}

/**
 * Describe the rate in human-readable form (e.g. "Fixed 5.25% p.a." or "Prime - 4.75% = 5.50%")
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
