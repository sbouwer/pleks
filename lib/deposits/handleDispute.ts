"use server"

import { createClient } from "@/lib/supabase/server"

export async function recordTenantDispute(
  leaseId: string,
  disputedItemIds: string[],
  tenantNotes: string
) {
  const supabase = await createClient()

  // Update items as disputed
  await supabase.from("deposit_deduction_items").update({
    tenant_disputed: true,
    dispute_notes: tenantNotes,
    classification: "disputed",
    updated_at: new Date().toISOString(),
  }).in("id", disputedItemIds)

  // Update reconciliation status
  await supabase.from("deposit_reconciliations").update({
    status: "disputed",
    updated_at: new Date().toISOString(),
  }).eq("lease_id", leaseId)

  // Update deposit timer
  await supabase.from("deposit_timers").update({
    status: "disputed",
  }).eq("lease_id", leaseId).eq("status", "running")

  return { success: true }
}

export async function resolveDispute(
  itemId: string,
  resolution: string,
  newClassification: string,
  newAmount: number
) {
  const supabase = await createClient()

  await supabase.from("deposit_deduction_items").update({
    dispute_resolved: true,
    dispute_resolution: resolution,
    classification: newClassification,
    deduction_amount_cents: newClassification === "tenant_damage" ? newAmount : 0,
    updated_at: new Date().toISOString(),
  }).eq("id", itemId)

  return { success: true }
}
