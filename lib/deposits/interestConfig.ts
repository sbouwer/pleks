/**
 * lib/deposits/interestConfig.ts — deposit-interest config + prime-rate resolution (the variable-rate engine)
 *
 * Auth:   server-only (service client); org-scoped.
 * Data:   deposit_interest_config (effective-dated rate rows), prime_rates (for prime/repo-linked rates).
 * Notes:  resolveDepositInterestConfig picks the most-specific effective-dated config for a date by the
 *         hierarchy account → unit → property → org (ADDENDUM_69A added the account scope). The accrual
 *         engine (lib/finance/depositInterest.ts) resolves the rate PER period through this — never a
 *         frozen snapshot — so a variable (prime/repo-linked) rate stays correct across rate changes.
 */
import { createServiceClient } from "@/lib/supabase/server"
import type { DepositInterestConfig } from "./rateUtils"
import { logQueryError } from "@/lib/supabase/logQueryError"

export type { DepositInterestConfig } from "./rateUtils"
export { describeRate } from "./rateUtils"

export interface ScopeCandidate {
  bank_account_id: string | null
  property_id: string | null
  unit_id: string | null
}

/**
 * Ordered deposit-interest-config scope candidates, most specific → least:
 * account → unit → property → org default (ADDENDUM_69A added the account scope).
 * Pure (no DB) so the hierarchy is unit-testable independently of the query.
 */
export function buildScopeCandidates(
  bankAccountId: string | null,
  propertyId: string | null,
  unitId: string | null,
): ScopeCandidate[] {
  const candidates: ScopeCandidate[] = []
  if (bankAccountId) candidates.push({ bank_account_id: bankAccountId, property_id: null, unit_id: null })
  if (unitId)        candidates.push({ bank_account_id: null, property_id: propertyId, unit_id: unitId })
  if (propertyId)    candidates.push({ bank_account_id: null, property_id: propertyId, unit_id: null })
  candidates.push({ bank_account_id: null, property_id: null, unit_id: null })
  return candidates
}

/**
 * Resolve the deposit interest config for a given lease context.
 * Hierarchy (most specific → least): deposit account → unit → property → org default.
 * The account scope (ADDENDUM_69A) ties the rate to the deposit-holding account the money sits in
 * (RHA s5(3)(c)); the non-account candidates filter bank_account_id IS NULL so an account-scoped row
 * is never mistaken for an org/unit/property default. Returns null if no config (no auto-accrual).
 */
export async function resolveDepositInterestConfig(
  orgId: string,
  propertyId: string | null,
  unitId: string | null,
  asOfDate: string,
  bankAccountId: string | null = null,
): Promise<DepositInterestConfig | null> {
  const supabase = await createServiceClient()

  for (const scope of buildScopeCandidates(bankAccountId, propertyId, unitId)) {
    let query = supabase
      .from("deposit_interest_config")
      .select("*")
      .eq("org_id", orgId)
      .lte("effective_from", asOfDate)
      .or(`effective_to.is.null,effective_to.gte.${asOfDate}`)

    query = scope.bank_account_id ? query.eq("bank_account_id", scope.bank_account_id) : query.is("bank_account_id", null)
    query = scope.unit_id        ? query.eq("unit_id", scope.unit_id)                  : query.is("unit_id", null)
    query = scope.property_id    ? query.eq("property_id", scope.property_id)          : query.is("property_id", null)

    const { data } = await query.order("effective_from", { ascending: false }).limit(1).maybeSingle()

    if (data) return data as DepositInterestConfig
  }

  return null
}

/**
 * Get the latest prime rate on or before the given date.
 */
export async function getPrimeRateOn(date: string): Promise<number | null> {
  const supabase = await createServiceClient()
  const { data, error: queryError } = await supabase
    .from("prime_rates")
    .select("rate_percent")
    .lte("effective_date", date)
    .order("effective_date", { ascending: false })
    .limit(1)
    .maybeSingle()
    logQueryError("getPrimeRateOn prime_rates", queryError)
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
