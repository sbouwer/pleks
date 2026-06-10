"use server"

/**
 * lib/actions/deposits.ts — deposit lifecycle server actions
 *
 * Auth:   requireAgentWriteAccess (all paths are writes)
 * Data:   deposit_reconciliations, deposit_deduction_items, deposit_charges, deposit_timers,
 *         tenant_view, leases, units, properties via gateway
 * Notes:  sendDepositSchedule transitions recon status → sent_to_tenant and fires
 *         deposit.return_schedule (mandatory, RHA s5(7)) via the comms router.
 *         ADDENDUM_63B: chargeItems included in the schedule and CRUD actions added.
 */

import * as React from "react"
import { requireAgentWriteAccess } from "@/lib/auth/server"
import { hasCapability } from "@/lib/auth/can"
import type { GatewayContext } from "@/lib/supabase/gateway"
import { revalidatePath } from "next/cache"
import { routeAndSend } from "@/lib/messaging/router"
import { fetchOrgSettings, buildBranding } from "@/lib/comms/send-email"
import {
  DepositReturnScheduleEmail,
  type DeductionItem,
  type DepositChargeItem,
} from "@/lib/comms/templates/tenant/deposits/deposit-return-schedule"
import { logQueryError } from "@/lib/supabase/logQueryError"
import { isValidJustification } from "@/lib/deposits/justification"

function formatZARLocal(cents: number): string {
  return "R " + (cents / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2 })
}

function formatDateLocal(iso: string): string {
  return new Date(iso).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })
}

// Deposit actions are finance writes (RBAC P4) — owner/is_admin exempt; others need the 'finance' capability.
async function denyNonFinance(gw: GatewayContext): Promise<{ error: string } | null> {
  return (await hasCapability(gw, "finance")) ? null : { error: "Finance access is required for deposit actions." }
}

export async function sendDepositSchedule(leaseId: string): Promise<{ success?: boolean; error?: string }> {
  const gw = await requireAgentWriteAccess("send_manual_comm")
  const denied = await denyNonFinance(gw); if (denied) return denied
  const { db, orgId } = gw

  const { data: recon, error: reconErr } = await db
    .from("deposit_reconciliations")
    .select("id, org_id, lease_id, tenant_id, status, deposit_held_cents, interest_accrued_cents, total_available_cents, total_deductions_cents, refund_to_tenant_cents")
    .eq("lease_id", leaseId)
    .eq("org_id", orgId)
    .single()

  if (reconErr || !recon) return { error: "Reconciliation not found" }
  if (recon.status === "sent_to_tenant" || recon.status === "refunded") {
    return { error: "Schedule has already been sent to the tenant" }
  }

  const { data: tenant, error: tenantErr } = await db
    .from("tenant_view")
    .select("first_name, last_name, email, phone")
    .eq("id", recon.tenant_id)
    .single()

  if (tenantErr || !tenant?.email) return { error: "Tenant email not found" }

  const { data: items, error: itemsErr } = await db
    .from("deposit_deduction_items")
    .select("id, room, item_description, deduction_amount_cents, classification, ai_justification")
    .eq("lease_id", leaseId)
    .order("created_at")

  if (itemsErr) return { error: itemsErr.message }

  const { data: charges, error: chargesErr } = await db
    .from("deposit_charges")
    .select("id, charge_type, description, deduction_amount_cents, notes")
    .eq("lease_id", leaseId)
    .eq("org_id", orgId)
    .eq("agent_confirmed", true)
    .order("created_at")

  if (chargesErr) return { error: chargesErr.message }

  const { data: timer, error: timerError } = await db
    .from("deposit_timers")
    .select("deadline, return_days")
    .eq("lease_id", leaseId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
    logQueryError("sendDepositSchedule deposit_timers", timerError)

  if (!timer?.deadline) {
    return { error: "Deposit timer not configured. The deposit deadline must be set up before the return schedule can be sent. Please configure the deposit timer first." }
  }

  const { data: lease, error: leaseError } = await db
    .from("leases")
    .select("start_date, end_date, units(unit_number, properties(address_line1, suburb, city))")
    .eq("id", leaseId)
    .maybeSingle()
    logQueryError("sendDepositSchedule leases", leaseError)

  type PropRow = { address_line1: string; suburb: string | null; city: string }
  type UnitRow = { unit_number: string; properties: PropRow | PropRow[] | null }
  const unitRaw = (lease as unknown as { units: UnitRow | UnitRow[] | null } | null)?.units
  const unitData = Array.isArray(unitRaw) ? unitRaw[0] : unitRaw
  const rawProps = unitData?.properties ?? null
  const propData = Array.isArray(rawProps) ? rawProps[0] : rawProps
  const propertyLabel = propData
    ? [propData.address_line1, `Unit ${unitData?.unit_number}`, propData.suburb ?? propData.city].filter(Boolean).join(", ")
    : leaseId

  const orgSettings = await fetchOrgSettings(orgId)
  const branding = buildBranding(orgSettings)

  const tenantName  = [tenant.first_name, tenant.last_name].filter(Boolean).join(" ") || "Tenant"
  const refNum      = recon.id.slice(0, 8).toUpperCase()
  const deadline    = formatDateLocal(timer.deadline as string)
  const hasDeductions = (items ?? []).some((i) => (i.deduction_amount_cents as number) > 0)
    || (charges ?? []).length > 0
  const returnDays  = (timer.return_days as number | null) ?? (hasDeductions ? 21 : 14)

  const deductionItems: DeductionItem[] = (items ?? []).map((i) => ({
    id:                     i.id as string,
    room:                   i.room as string | null,
    item_description:       i.item_description as string,
    deduction_amount_cents: i.deduction_amount_cents as number,
    classification:         i.classification as string,
    ai_justification:       i.ai_justification as string | null,
  }))

  const chargeItems: DepositChargeItem[] = (charges ?? []).map((c) => ({
    id:                     c.id as string,
    charge_type:            c.charge_type as string,
    description:            c.description as string,
    deduction_amount_cents: c.deduction_amount_cents as number,
    notes:                  c.notes as string | null,
  }))

  const { error: updateErr } = await db
    .from("deposit_reconciliations")
    .update({ status: "sent_to_tenant", schedule_sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", recon.id)

  if (updateErr) return { error: updateErr.message }

  await routeAndSend({
    orgId,
    tenantId:       recon.tenant_id as string,
    templateKey:    "deposit.return_schedule",
    to:             { email: tenant.email, phone: (tenant.phone as string | null) ?? undefined, name: tenantName },
    subject:        `DEPOSIT RETURN SCHEDULE — ${propertyLabel} — Ref ${refNum}`,
    emailElement:   React.createElement(DepositReturnScheduleEmail, {
      branding,
      tenantName,
      propertyLabel,
      leaseStartDate:         lease?.start_date ? formatDateLocal(lease.start_date as string) : "",
      leaseEndDate:           lease?.end_date   ? formatDateLocal(lease.end_date as string)   : "",
      depositHeldDisplay:     formatZARLocal(recon.deposit_held_cents as number),
      interestAccruedDisplay: formatZARLocal(recon.interest_accrued_cents as number),
      totalAvailableDisplay:  formatZARLocal(recon.total_available_cents as number),
      totalDeductionsDisplay: formatZARLocal(recon.total_deductions_cents as number),
      refundToTenantDisplay:  formatZARLocal(recon.refund_to_tenant_cents as number),
      deductionItems,
      chargeItems,
      deadlineDate:           deadline,
      returnDays,
      referenceNumber:        refNum,
    }),
    entityType:       "deposit_reconciliation",
    entityId:         recon.id as string,
    triggerEventType: "deposit_schedule_sent",
    triggerEventId:   recon.id as string,
    toneVariant:      "n/a",
  })

  revalidatePath(`/leases/${leaseId}/deposit`)
  return { success: true }
}

// ─── CRUD actions for deposit_charges (ADDENDUM_63B) ─────────────────────────

interface CreateDepositChargeInput {
  charge_type: string
  description: string
  deduction_amount_cents: number
  reconciliation_id?: string
  source_invoice_id?: string
  source_arrears_case_id?: string
  source_supplier_invoice_id?: string
  source_municipal_bill_id?: string
  source_lease_charge_id?: string
  supporting_doc_path?: string
  notes?: string
}

export async function createDepositCharge(
  leaseId: string,
  input: CreateDepositChargeInput
): Promise<{ id?: string; error?: string }> {
  const gw = await requireAgentWriteAccess("edit_lease")
  const denied = await denyNonFinance(gw); if (denied) return denied
  const { db, orgId, userId } = gw

  const { data, error } = await db.from("deposit_charges").insert({
    org_id:   orgId,
    lease_id: leaseId,
    created_by: userId,
    ...input,
  }).select("id").single()

  if (error) return { error: error.message }
  revalidatePath(`/leases/${leaseId}/deposit`)
  return { id: data.id as string }
}

export async function updateDepositCharge(
  chargeId: string,
  leaseId: string,
  input: Partial<CreateDepositChargeInput>
): Promise<{ success?: boolean; error?: string }> {
  const gw = await requireAgentWriteAccess("edit_lease")
  const denied = await denyNonFinance(gw); if (denied) return denied
  const { db, orgId } = gw

  const { error } = await db
    .from("deposit_charges")
    .update(input)
    .eq("id", chargeId)
    .eq("org_id", orgId)
    .eq("agent_confirmed", false)

  if (error) return { error: error.message }
  revalidatePath(`/leases/${leaseId}/deposit`)
  return { success: true }
}

export async function confirmDepositCharge(
  chargeId: string,
  leaseId: string
): Promise<{ success?: boolean; error?: string }> {
  const gw = await requireAgentWriteAccess("edit_lease")
  const denied = await denyNonFinance(gw); if (denied) return denied
  const { db, orgId, userId } = gw

  const { error } = await db
    .from("deposit_charges")
    .update({
      agent_confirmed: true,
      confirmed_by:    userId,
      confirmed_at:    new Date().toISOString(),
    })
    .eq("id", chargeId)
    .eq("org_id", orgId)

  if (error) return { error: error.message }
  revalidatePath(`/leases/${leaseId}/deposit`)
  return { success: true }
}

export async function deleteDepositCharge(
  chargeId: string,
  leaseId: string
): Promise<{ success?: boolean; error?: string }> {
  const gw = await requireAgentWriteAccess("edit_lease")
  const denied = await denyNonFinance(gw); if (denied) return denied
  const { db, orgId } = gw

  const { error } = await db
    .from("deposit_charges")
    .delete()
    .eq("id", chargeId)
    .eq("org_id", orgId)
    .eq("agent_confirmed", false)

  if (error) return { error: error.message }
  revalidatePath(`/leases/${leaseId}/deposit`)
  return { success: true }
}

// ─── Deduction-item confirm + justification (ADDENDUM_FINANCIAL_INTEGRITY F-2) ────────────────────────────────
// Inspection-derived tenant-damage items were never confirmed in code (agent_confirmed never set true), so
// calculateReturn's damageTotal — which sums confirmed tenant_damage items — was always 0: itemised damage never
// reduced the refund. These wire the confirm (so it counts) AND gate it on a real reason (RHA s5 / Tribunal).

/** Agent edits/enters a deduction item's justification (only before confirm — the schedule is immutable after). */
export async function updateDeductionJustification(
  itemId: string, leaseId: string, text: string
): Promise<{ success?: boolean; error?: string }> {
  const gw = await requireAgentWriteAccess("edit_lease")
  const denied = await denyNonFinance(gw); if (denied) return denied
  const { db, orgId } = gw

  const { error } = await db
    .from("deposit_deduction_items")
    .update({ ai_justification: text.trim(), ai_justification_at: new Date().toISOString(), ai_model: "manual_edited" })
    .eq("id", itemId)
    .eq("org_id", orgId)
    .eq("agent_confirmed", false)

  if (error) return { error: error.message }
  revalidatePath(`/leases/${leaseId}/deposit`)
  return { success: true }
}

/** Confirm a deduction item — only allowed on a tenant_damage item that has a valid justification. confirmed_by/
 *  confirmed_at on the row are the who/when trail; the DB trigger is the durable backstop. */
export async function confirmDeductionItem(
  itemId: string, leaseId: string
): Promise<{ success?: boolean; error?: string }> {
  const gw = await requireAgentWriteAccess("edit_lease")
  const denied = await denyNonFinance(gw); if (denied) return denied
  const { db, orgId, userId } = gw

  const { data: item, error: itemErr } = await db
    .from("deposit_deduction_items")
    .select("classification, ai_justification")
    .eq("id", itemId)
    .eq("org_id", orgId)
    .single()
  logQueryError("confirmDeductionItem deposit_deduction_items", itemErr)
  if (!item) return { error: "Deduction item not found" }

  if (item.classification === "tenant_damage" && !isValidJustification(item.ai_justification as string | null)) {
    return { error: "Add a reason for this deduction before confirming it — it appears on the tenant's deposit schedule (RHA s5)." }
  }

  const { error } = await db
    .from("deposit_deduction_items")
    .update({ agent_confirmed: true, confirmed_by: userId, confirmed_at: new Date().toISOString() })
    .eq("id", itemId)
    .eq("org_id", orgId)

  if (error) return { error: error.message }
  revalidatePath(`/leases/${leaseId}/deposit`)
  return { success: true }
}
