"use server"

/**
 * lib/deposits/calculateReturn.ts — compute and persist deposit return figures
 *
 * Auth:   gateway() — authenticates + provides the caller's orgId; the lease read is org-scoped so a
 *         foreign leaseId computes/persists nothing (was previously ungated + cross-org — caller-ID
 *         census). Lockdown-free like disburse: computing a deposit return is obligation-driven (RHA),
 *         must work when the subscription is paused/cancelled ("Your Data, Always").
 * Data:   deposit_deduction_items, deposit_charges, deposit_reconciliations via the gateway service client.
 * Notes:  Total deductions = confirmed tenant_damage items + confirmed deposit_charges (ADDENDUM_63B).
 */
import { gateway } from "@/lib/supabase/gateway"
import { getDepositPaid, getTotalInterestAccrued } from "./balance"

export async function calculateDepositReturn(leaseId: string) {
  const gw = await gateway()
  if (!gw) return { error: "Not authenticated" }
  const { db: supabase, orgId } = gw

  // Org-scope guard (caller-ID census): a foreign leaseId matches no row → "Lease not found".
  const { data: lease, error: leaseErr } = await supabase
    .from("leases")
    .select("org_id, tenant_id")
    .eq("id", leaseId)
    .eq("org_id", orgId)
    .single()

  if (leaseErr || !lease) return { error: "Lease not found" }

  const [{ data: deductionItems, error: diErr }, { data: chargeItems, error: ciErr }] = await Promise.all([
    supabase
      .from("deposit_deduction_items")
      .select("deduction_amount_cents")
      .eq("lease_id", leaseId)
      .eq("org_id", orgId)
      .eq("classification", "tenant_damage")
      .eq("agent_confirmed", true),
    supabase
      .from("deposit_charges")
      .select("deduction_amount_cents")
      .eq("lease_id", leaseId)
      .eq("org_id", orgId)
      .eq("agent_confirmed", true),
  ])

  if (diErr) { console.error("calculateDepositReturn: deduction_items query failed:", diErr.message); return { error: diErr.message } }
  if (ciErr) { console.error("calculateDepositReturn: deposit_charges query failed:", ciErr.message); return { error: ciErr.message } }

  const damageTotal  = (deductionItems ?? []).reduce((s, i) => s + (i.deduction_amount_cents ?? 0), 0)
  const chargeTotal  = (chargeItems ?? []).reduce((s, c) => s + (c.deduction_amount_cents ?? 0), 0)
  const totalDeductions = damageTotal + chargeTotal

  const [depositHeld, interestAccrued] = await Promise.all([
    getDepositPaid(leaseId),
    getTotalInterestAccrued(leaseId),
  ])

  const totalAvailable        = depositHeld + interestAccrued
  const refundToTenant        = Math.max(0, totalAvailable - totalDeductions)
  const deductionsToLandlord  = Math.min(totalDeductions, totalAvailable)

  const { error: upsertErr } = await supabase.from("deposit_reconciliations").upsert({
    org_id:                     orgId,
    lease_id:                   leaseId,
    tenant_id:                  lease.tenant_id,
    deposit_held_cents:         depositHeld,
    interest_accrued_cents:     interestAccrued,
    total_available_cents:      totalAvailable,
    total_deductions_cents:     totalDeductions,
    deduction_items_count:      (deductionItems?.length ?? 0) + (chargeItems?.length ?? 0),
    refund_to_tenant_cents:     refundToTenant,
    deductions_to_landlord_cents: deductionsToLandlord,
    status: "pending_review",
  }, { onConflict: "lease_id" })

  if (upsertErr) { console.error("calculateDepositReturn: upsert failed:", upsertErr.message) }

  return {
    depositHeld,
    interestAccrued,
    totalAvailable,
    totalDeductions,
    refundToTenant,
    deductionsToLandlord,
  }
}
