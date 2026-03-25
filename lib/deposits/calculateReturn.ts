"use server"

import { createClient } from "@/lib/supabase/server"
import { getDepositPaid, getTotalInterestAccrued } from "./balance"

export async function calculateDepositReturn(leaseId: string) {
  const supabase = await createClient()

  const { data: lease } = await supabase
    .from("leases")
    .select("org_id, tenant_id")
    .eq("id", leaseId)
    .single()

  if (!lease) return { error: "Lease not found" }

  // Confirmed deduction items only
  const { data: deductionItems } = await supabase
    .from("deposit_deduction_items")
    .select("deduction_amount_cents")
    .eq("lease_id", leaseId)
    .eq("classification", "tenant_damage")
    .eq("agent_confirmed", true)

  const totalDeductions = (deductionItems ?? []).reduce(
    (sum, item) => sum + (item.deduction_amount_cents ?? 0), 0
  )

  const [depositHeld, interestAccrued] = await Promise.all([
    getDepositPaid(leaseId),
    getTotalInterestAccrued(leaseId),
  ])

  const totalAvailable = depositHeld + interestAccrued
  const refundToTenant = Math.max(0, totalAvailable - totalDeductions)
  const deductionsToLandlord = Math.min(totalDeductions, totalAvailable)

  // Update reconciliation record
  await supabase.from("deposit_reconciliations").upsert({
    org_id: lease.org_id,
    lease_id: leaseId,
    tenant_id: lease.tenant_id,
    deposit_held_cents: depositHeld,
    interest_accrued_cents: interestAccrued,
    total_available_cents: totalAvailable,
    total_deductions_cents: totalDeductions,
    deduction_items_count: deductionItems?.length ?? 0,
    refund_to_tenant_cents: refundToTenant,
    deductions_to_landlord_cents: deductionsToLandlord,
    status: "pending_review",
  }, { onConflict: "lease_id" })

  return {
    depositHeld,
    interestAccrued,
    totalAvailable,
    totalDeductions,
    refundToTenant,
    deductionsToLandlord,
  }
}
