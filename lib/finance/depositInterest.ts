import { differenceInDays, format, startOfMonth } from "date-fns"
import { createServiceClient } from "@/lib/supabase/server"
import { resolveDepositInterestConfig, resolveEffectiveRate } from "@/lib/deposits/interestConfig"

/**
 * Pure calculation — used by both the server action and the cron route.
 */
export function calculateDepositInterest(
  depositCents: number,
  annualRatePercent: number,
  fromDate: Date,
  toDate: Date
): number {
  const days = differenceInDays(toDate, fromDate)
  if (days <= 0) return 0
  return Math.round((depositCents * (annualRatePercent / 100) / 365) * days)
}

/**
 * Deposit interest accrual.
 *
 * Called by the monthly cron (last day of each month or 1st of next month).
 * Also called at lease end when finalising deposit reconciliation.
 *
 * Rate is resolved via the config hierarchy: unit → property → org default.
 * Falls back to lease.deposit_interest_rate_percent if no config found.
 */
export async function accrueDepositInterest(
  leaseId: string,
  upToDate: Date = new Date()
): Promise<{
  interestCents: number
  fromDate: Date
  toDate: Date
  ratePercent: number
}> {
  const supabase = await createServiceClient()

  const { data: lease } = await supabase
    .from("leases")
    .select(`
      id, org_id, tenant_id, unit_id, property_id,
      deposit_amount_cents,
      deposit_interest_rate_percent,
      deposit_interest_last_accrued_date,
      start_date
    `)
    .eq("id", leaseId)
    .single()

  if (!lease?.deposit_amount_cents) {
    return { interestCents: 0, fromDate: upToDate, toDate: upToDate, ratePercent: 0 }
  }

  const fromDate = lease.deposit_interest_last_accrued_date
    ? new Date(lease.deposit_interest_last_accrued_date)
    : new Date(lease.start_date)

  const daysElapsed = differenceInDays(upToDate, fromDate)

  if (daysElapsed <= 0) {
    return { interestCents: 0, fromDate, toDate: upToDate, ratePercent: 0 }
  }

  // Resolve config via hierarchy
  const asOfDate = format(upToDate, "yyyy-MM-dd")
  const config = await resolveDepositInterestConfig(
    lease.org_id,
    lease.property_id ?? null,
    lease.unit_id ?? null,
    asOfDate
  )

  let ratePercent: number
  let rateConfigId: string | null = null

  if (config) {
    if (config.rate_type === "manual") {
      // Manual mode — skip auto-accrual
      return { interestCents: 0, fromDate, toDate: upToDate, ratePercent: 0 }
    }
    const resolved = await resolveEffectiveRate(config, asOfDate)
    if (resolved === null || resolved <= 0) {
      return { interestCents: 0, fromDate, toDate: upToDate, ratePercent: 0 }
    }
    ratePercent = resolved
    rateConfigId = config.id
  } else {
    // Fall back to per-lease rate
    ratePercent = lease.deposit_interest_rate_percent ?? 5
  }

  const interestCents = calculateDepositInterest(
    lease.deposit_amount_cents, ratePercent, fromDate, upToDate
  )

  if (interestCents <= 0) {
    return { interestCents: 0, fromDate, toDate: upToDate, ratePercent }
  }

  // Record to deposit_transactions (immutable trust ledger)
  await supabase.from("deposit_transactions").insert({
    org_id: lease.org_id,
    lease_id: leaseId,
    tenant_id: lease.tenant_id,
    transaction_type: "interest_accrued",
    direction: "credit",
    amount_cents: interestCents,
    description: `Deposit interest accrued: ${ratePercent.toFixed(2)}% p.a. for ${daysElapsed} days`,
    reference: `DEP-INT-${format(upToDate, "yyyy-MM")}`,
    effective_rate_percent: ratePercent,
    rate_config_id: rateConfigId,
  })

  // Also record to trust_transactions (main trust ledger)
  await supabase.from("trust_transactions").insert({
    org_id: lease.org_id,
    lease_id: leaseId,
    transaction_type: "deposit_interest",
    direction: "credit",
    amount_cents: interestCents,
    description: `Deposit interest: ${ratePercent.toFixed(2)}% p.a. × ${daysElapsed} days`,
    statement_month: startOfMonth(upToDate).toISOString(),
  })

  // Update last accrued date
  await supabase
    .from("leases")
    .update({ deposit_interest_last_accrued_date: format(upToDate, "yyyy-MM-dd") })
    .eq("id", leaseId)

  await supabase.from("audit_log").insert({
    org_id: lease.org_id,
    table_name: "deposit_transactions",
    record_id: leaseId,
    action: "INSERT",
    new_values: {
      type: "deposit_interest_accrued",
      amount_cents: interestCents,
      rate_percent: ratePercent,
      rate_config_id: rateConfigId,
      days: daysElapsed,
    },
  })

  return { interestCents, fromDate, toDate: upToDate, ratePercent }
}
