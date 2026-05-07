"use server"

/**
 * lib/deposits/calculateReturn.ts — compute and persist deposit return figures
 *
 * Auth:   Called from DepositActions (agent session, not gateway — leaseId-only input)
 * Data:   deposit_deduction_items, deposit_charges, deposit_reconciliations via service client
 * Notes:  Uses service client (bypasses RLS) because the cookie client does not propagate
 *         auth.uid() to Postgres in server action context. Total deductions = confirmed
 *         tenant_damage items + confirmed deposit_charges (ADDENDUM_63B).
 */
import { createServiceClient } from "@/lib/supabase/server"
import { getDepositPaid, getTotalInterestAccrued } from "./balance"

export async function calculateDepositReturn(leaseId: string) {
  const supabase = await createServiceClient()

  const { data: lease, error: leaseErr } = await supabase
    .from("leases")
    .select("org_id, tenant_id")
    .eq("id", leaseId)
    .single()

  if (leaseErr || !lease) return { error: "Lease not found" }

  const [{ data: deductionItems, error: diErr }, { data: chargeItems, error: ciErr }] = await Promise.all([
    supabase
      .from("deposit_deduction_items")
      .select("deduction_amount_cents")
      .eq("lease_id", leaseId)
      .eq("classification", "tenant_damage")
      .eq("agent_confirmed", true),
    supabase
      .from("deposit_charges")
      .select("deduction_amount_cents")
      .eq("lease_id", leaseId)
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
    org_id:                     lease.org_id,
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
