/**
 * lib/finance/depositInterest.ts — deposit interest calc + monthly/lease-end accrual posting
 *
 * Data:   reads leases + deposit interest config (unit→property→org hierarchy); posts via
 *         record_deposit_atomic RPC — deposit_transactions + trust_ledger + the
 *         leases.deposit_interest_last_accrued_date watermark advance all commit atomically; writes audit_log
 * Notes:  service-client helper (no gate of its own) — driven by the deposit-interest cron and
 *         lease-end reconciliation. The watermark advance is folded INTO the RPC (ledger 4c) behind a
 *         FOR UPDATE + compare-and-set: a crash mid-accrual or two concurrent runs can no longer
 *         double-accrue the same window, and on RPC failure the watermark is untouched so the next run
 *         retries. (Replaced the old separate post-commit UPDATE that left the accrual/advance non-atomic.)
 */
import { differenceInDays, format, startOfMonth } from "date-fns"
import { createServiceClient } from "@/lib/supabase/server"
import { resolveDepositInterestConfig, resolveEffectiveRate } from "@/lib/deposits/interestConfig"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { recordAudit } from "@/lib/audit/recordAudit"

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
 * Rate is resolved via the config hierarchy (account → unit → property → org), else the per-lease rate.
 * If NEITHER exists, accrual is HELD — it accrues nothing rather than inventing a rate on trust money.
 * (It used to fall back to a hard-coded 5%. See the hold below for what that cost.)
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

  const { data: lease, error: leaseError } = await supabase
    .from("leases")
    .select(`
      id, org_id, tenant_id, unit_id, property_id,
      deposit_account_id, trust_account_id,
      deposit_amount_cents,
      deposit_interest_rate_percent,
      deposit_interest_last_accrued_date,
      start_date
    `)
    .eq("id", leaseId)
    .single()
    logQueryError("accrueDepositInterest leases", leaseError)

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
    asOfDate,
    // Effective deposit account: a dedicated deposit account if set, else the trust account it falls back to.
    lease.deposit_account_id ?? lease.trust_account_id ?? null,
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
  } else if (lease.deposit_interest_rate_percent != null) {
    // No config reaches this lease, but the lease itself carries a rate someone chose. Use it.
    ratePercent = lease.deposit_interest_rate_percent
  } else {
    // ── THE HOLD. No config resolves, and the lease has no rate. This used to accrue at a HARD-CODED 5% p.a.
    //
    // That fallback did two kinds of damage, and the second is the worse one:
    //   1. It invented a rate and applied it to money the agency holds in trust for someone else. An
    //      under-accrual short-changes the tenant, an over-accrual the landlord, and neither is discoverable
    //      from the ledger afterwards.
    //   2. It SUPPRESSED THE SIGNAL. In prod, an agency's rate configs were scoped to their deposit-holding
    //      bank account while the leases had no account linked — so the configs resolved to nothing and this
    //      branch quietly posted 5% for three weeks. The configured 3% was unreachable and NOBODY KNEW,
    //      because the fallback made the failure look like success. 88 postings at a rate nobody chose.
    //
    // A hold does not just protect the money. It surfaces the truth on the day it breaks, rather than the
    // month somebody reads the ledger. So: accrue NOTHING.
    //
    // NOTE the hold is EMERGENT, not a stamped flag on the lease. An earlier draft persisted a
    // `deposit_rate_status = 'not_set'` column and gated accrual on it — which would have held the lease
    // FOREVER, even after the agency fixed their config, because the stamp never re-evaluates. That is the
    // ADDENDUM_70K Phase E lesson exactly: a column that cannot exist cannot be stamped wrong. Deriving the
    // hold from live resolution means it heals itself the moment a rate becomes reachable.
    return { interestCents: 0, fromDate, toDate: upToDate, ratePercent: 0 }
  }

  const interestCents = calculateDepositInterest(
    lease.deposit_amount_cents, ratePercent, fromDate, upToDate
  )

  if (interestCents <= 0) {
    return { interestCents: 0, fromDate, toDate: upToDate, ratePercent }
  }

  // Atomic deposit sub-ledger + trust posting + watermark advance (ADDENDUM_TRUST_RPC_ATOMICITY step 2 +
  // ledger 4c) — all three commit together or not at all. Inbound credit, so initiated_by 'pleks_system'
  // passes the sovereignty trigger (Rule 2 blocks only outbound system movement). p_advance_last_accrued_to +
  // p_expected_last_accrued fold the deposit_interest_last_accrued_date advance INTO the RPC: the lease is
  // locked FOR UPDATE and the watermark compare-and-set inside the same transaction, so a crash between the
  // post and the advance (old bug) or two concurrent runs reading the same stale watermark can no longer
  // double-accrue the same window — a moved watermark RAISEs and rolls the whole posting back.
  const { error: depErr } = await supabase.rpc("record_deposit_atomic", {
    p_org_id: lease.org_id,
    p_lease_id: leaseId,
    p_tenant_id: lease.tenant_id,
    p_amount_cents: interestCents,
    p_dep_txn_type: "interest_accrued",
    p_dep_description: `Deposit interest accrued: ${ratePercent.toFixed(2)}% p.a. for ${daysElapsed} days`,
    p_trust_txn_type: "deposit_interest",
    p_trust_description: `Deposit interest: ${ratePercent.toFixed(2)}% p.a. × ${daysElapsed} days`,
    p_initiated_by: "pleks_system",
    p_created_by: null,
    p_property_id: null,
    p_unit_id: null,
    p_reference: `DEP-INT-${format(upToDate, "yyyy-MM")}`,
    p_effective_rate_percent: ratePercent,
    p_rate_config_id: rateConfigId,
    p_statement_month: format(startOfMonth(upToDate), "yyyy-MM-dd"),
    p_advance_last_accrued_to: format(upToDate, "yyyy-MM-dd"),
    p_expected_last_accrued: lease.deposit_interest_last_accrued_date ?? null,
  })
  if (depErr) {
    // Rolled back atomically — the watermark is NOT advanced (it moves only inside the RPC now), so the next
    // run retries this window. A "watermark moved" error here means a concurrent run already accrued it (the
    // compare-and-set aborted the duplicate) — benign; the window is not lost.
    console.error("[deposit-interest] record_deposit_atomic failed:", depErr.message)
    return { interestCents: 0, fromDate, toDate: upToDate, ratePercent }
  }

  await recordAudit(supabase, { orgId: lease.org_id, table: "deposit_transactions", recordId: leaseId, action: "INSERT", after: {
      type: "deposit_interest_accrued",
      amount_cents: interestCents,
      rate_percent: ratePercent,
      rate_config_id: rateConfigId,
      days: daysElapsed,
    } })

  return { interestCents, fromDate, toDate: upToDate, ratePercent }
}
