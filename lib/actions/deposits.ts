"use server"

/**
 * lib/actions/deposits.ts — deposit lifecycle server actions
 *
 * Auth:   gateway (agent session required)
 * Data:   deposit_reconciliations, deposit_deduction_items, deposit_timers,
 *         tenant_view, leases, units, properties via gateway
 * Notes:  sendDepositSchedule transitions recon status → sent_to_tenant and fires
 *         deposit.return_schedule (mandatory, RHA s5(7)) via the comms router.
 *         BUILD_63 Phase 3.
 */

import * as React from "react"
import { gateway } from "@/lib/supabase/gateway"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { routeAndSend } from "@/lib/messaging/router"
import { fetchOrgSettings, buildBranding } from "@/lib/comms/send-email"
import {
  DepositReturnScheduleEmail,
  type DeductionItem,
} from "@/lib/comms/templates/tenant/deposits/deposit-return-schedule"

function formatZARLocal(cents: number): string {
  return "R " + (cents / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2 })
}

function formatDateLocal(iso: string): string {
  return new Date(iso).toLocaleDateString("en-ZA", { day: "numeric", month: "long", year: "numeric" })
}

export async function sendDepositSchedule(leaseId: string): Promise<{ success?: boolean; error?: string }> {
  const gw = await gateway()
  if (!gw) redirect("/login")
  const { db, orgId } = gw

  // Fetch reconciliation
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

  // Fetch tenant contact
  const { data: tenant, error: tenantErr } = await db
    .from("tenant_view")
    .select("first_name, last_name, email, phone")
    .eq("id", recon.tenant_id)
    .single()

  if (tenantErr || !tenant?.email) return { error: "Tenant email not found" }

  // Fetch deduction items
  const { data: items, error: itemsErr } = await db
    .from("deposit_deduction_items")
    .select("room, item_description, deduction_amount_cents, classification, ai_justification")
    .eq("lease_id", leaseId)
    .order("created_at")

  if (itemsErr) return { error: itemsErr.message }

  // Fetch timer for deadline
  const { data: timer } = await db
    .from("deposit_timers")
    .select("deadline, return_days")
    .eq("lease_id", leaseId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  // Fetch lease + property info
  const { data: lease } = await db
    .from("leases")
    .select("start_date, end_date, units(unit_number, properties(address_line1, suburb, city))")
    .eq("id", leaseId)
    .maybeSingle()

  type PropRow = { address_line1: string; suburb: string | null; city: string }
  type UnitRow = { unit_number: string; properties: PropRow | PropRow[] | null }
  const unitRaw = (lease as unknown as { units: UnitRow | UnitRow[] | null } | null)?.units
  const unitData = Array.isArray(unitRaw) ? unitRaw[0] : unitRaw
  const rawProps = unitData?.properties ?? null
  const propData = Array.isArray(rawProps) ? rawProps[0] : rawProps
  const propertyLabel = propData
    ? [propData.address_line1, `Unit ${unitData?.unit_number}`, propData.suburb ?? propData.city].filter(Boolean).join(", ")
    : leaseId

  // Build org branding
  const orgSettings = await fetchOrgSettings(orgId)
  const branding = buildBranding(orgSettings)

  if (!timer?.deadline) {
    return { error: "Deposit timer has no deadline set — configure the timer before sending the schedule" }
  }

  const tenantName = [tenant.first_name, tenant.last_name].filter(Boolean).join(" ") || "Tenant"
  const refNum = recon.id.slice(0, 8).toUpperCase()
  const deadline = formatDateLocal(timer.deadline as string)
  const hasDeductions = (items ?? []).some((i) => (i.deduction_amount_cents as number) > 0)
  const returnDays = (timer.return_days as number | null) ?? (hasDeductions ? 21 : 14)

  const deductionItems: DeductionItem[] = (items ?? []).map((i) => ({
    room: i.room as string | null,
    item_description: i.item_description as string,
    deduction_amount_cents: i.deduction_amount_cents as number,
    classification: i.classification as string,
    ai_justification: i.ai_justification as string | null,
  }))

  // Transition status before firing comm (idempotent guard above already checked)
  const { error: updateErr } = await db
    .from("deposit_reconciliations")
    .update({ status: "sent_to_tenant", schedule_sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", recon.id)

  if (updateErr) return { error: updateErr.message }

  // Fire deposit.return_schedule (mandatory — queued for retry if it fails)
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
