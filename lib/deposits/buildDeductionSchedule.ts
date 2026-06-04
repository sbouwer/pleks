"use server"

/**
 * lib/deposits/buildDeductionSchedule.ts — build deposit deduction items + reconciliation from a move-out inspection
 *
 * Auth:   server-only ("use server"); called from deposit-disbursement flows
 * Data:   leases, inspection_items, inspections, deposit_deduction_items, deposit_reconciliations (Supabase)
 * Notes:  classifies each move-out item against the move-in baseline; sums tenant_damage deductions into a reconciliation row
 */
import { createClient } from "@/lib/supabase/server"
import { generateDeductionJustification } from "./generateJustification"
import { getDepositPaid, getTotalInterestAccrued } from "./balance"

export async function buildDeductionSchedule(
  leaseId: string,
  inspectionId: string
) {
  const supabase = await createClient()

  const { data: lease, error: leaseError } = await supabase
    .from("leases")
    .select("id, org_id, tenant_id, deposit_amount_cents")
    .eq("id", leaseId)
    .single()

  if (leaseError) console.error("buildDeductionSchedule leases read failed:", leaseError.message)
  if (!lease) return { error: "Lease not found" }

  // Get items from move-out inspection
  const { data: inspectionItems, error: inspectionItemsError } = await supabase
    .from("inspection_items")
    .select("id, room, item_name, condition, notes, estimated_cost_cents")
    .eq("inspection_id", inspectionId)
    .in("condition", ["tenant_damage", "poor", "damaged", "wear_and_tear"])
  if (inspectionItemsError) console.error("buildDeductionSchedule inspection_items read failed:", inspectionItemsError.message)

  // Get move-in inspection for pre-existing condition check
  const { data: moveInInspection, error: moveInInspectionError } = await supabase
    .from("inspections")
    .select("id")
    .eq("lease_id", leaseId)
    .eq("type", "move_in")
    .single()
  if (moveInInspectionError) console.error("buildDeductionSchedule move-in inspections read failed:", moveInInspectionError.message)

  let moveInItems: Record<string, unknown>[] = []
  if (moveInInspection) {
    const { data, error: moveInItemsError } = await supabase
      .from("inspection_items")
      .select("room, item_name, condition")
      .eq("inspection_id", moveInInspection.id)
    if (moveInItemsError) console.error("buildDeductionSchedule move-in inspection_items read failed:", moveInItemsError.message)
    moveInItems = data ?? []
  }

  // Create deduction items
  for (const item of inspectionItems ?? []) {
    // Check move-in condition for pre-existing
    const moveInMatch = moveInItems.find(
      (mi) => mi.room === item.room && mi.item_name === item.item_name
    )

    let classification: string
    if (moveInMatch && (moveInMatch.condition === "poor" || moveInMatch.condition === "damaged")) {
      classification = "pre_existing"
    } else if (item.condition === "wear_and_tear") {
      classification = "wear_and_tear"
    } else {
      classification = "tenant_damage"
    }

    const { data: deductionItem, error: deductionItemError } = await supabase
      .from("deposit_deduction_items")
      .insert({
        org_id: lease.org_id,
        lease_id: leaseId,
        inspection_id: inspectionId,
        inspection_item_id: item.id,
        room: item.room,
        item_description: `${item.item_name}${item.notes ? ` — ${item.notes}` : ""}`,
        classification,
        deduction_amount_cents: classification === "tenant_damage"
          ? (item.estimated_cost_cents ?? 0) : 0,
      })
      .select("id")
      .single()
    if (deductionItemError) console.error("buildDeductionSchedule deposit_deduction_items insert failed:", deductionItemError.message)

    // Generate AI justification for tenant damage items
    if (classification === "tenant_damage" && deductionItem) {
      await generateDeductionJustification(deductionItem.id)
    }
  }

  // Create reconciliation record
  const depositHeld = await getDepositPaid(leaseId)
  const interestAccrued = await getTotalInterestAccrued(leaseId)
  const totalAvailable = depositHeld + interestAccrued

  // Sum confirmed deductions
  const { data: allDeductions, error: allDeductionsError } = await supabase
    .from("deposit_deduction_items")
    .select("deduction_amount_cents")
    .eq("lease_id", leaseId)
    .eq("classification", "tenant_damage")
  if (allDeductionsError) console.error("buildDeductionSchedule deposit_deduction_items read failed:", allDeductionsError.message)

  const totalDeductions = (allDeductions ?? []).reduce(
    (s, d) => s + (d.deduction_amount_cents ?? 0), 0
  )

  const refundToTenant = Math.max(0, totalAvailable - totalDeductions)

  await supabase.from("deposit_reconciliations").upsert({
    org_id: lease.org_id,
    lease_id: leaseId,
    tenant_id: lease.tenant_id,
    inspection_id: inspectionId,
    deposit_held_cents: depositHeld,
    interest_accrued_cents: interestAccrued,
    total_available_cents: totalAvailable,
    total_deductions_cents: totalDeductions,
    deduction_items_count: (allDeductions ?? []).length,
    refund_to_tenant_cents: refundToTenant,
    deductions_to_landlord_cents: Math.min(totalDeductions, totalAvailable),
    status: "pending_review",
  }, { onConflict: "lease_id" })

  return { success: true }
}
