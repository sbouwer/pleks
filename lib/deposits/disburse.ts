"use server"

import { createClient } from "@/lib/supabase/server"
import { formatZAR } from "@/lib/constants"

export async function disburseDeposit(leaseId: string, agentId: string) {
  const supabase = await createClient()

  const { data: recon } = await supabase
    .from("deposit_reconciliations")
    .select(`
      id, org_id, lease_id, tenant_id,
      refund_to_tenant_cents, deductions_to_landlord_cents,
      deposit_held_cents, total_deductions_cents
    `)
    .eq("lease_id", leaseId)
    .single()

  if (!recon) return { error: "Reconciliation not found" }

  const { data: tenant } = await supabase
    .from("tenants")
    .select("first_name, last_name, email")
    .eq("id", recon.tenant_id)
    .single()

  const tenantName = tenant ? `${tenant.first_name} ${tenant.last_name}` : "Tenant"
  const now = new Date()
  const refPrefix = `DEPOSIT-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`

  // 1. Refund to tenant
  if (recon.refund_to_tenant_cents > 0) {
    await supabase.from("deposit_transactions").insert({
      org_id: recon.org_id,
      lease_id: leaseId,
      tenant_id: recon.tenant_id,
      transaction_type: "deposit_returned_to_tenant",
      direction: "debit",
      amount_cents: recon.refund_to_tenant_cents,
      description: `Deposit refund — ${tenantName}`,
      reference: refPrefix,
      created_by: agentId,
    })

    // Trust account debit
    await supabase.from("trust_transactions").insert({
      org_id: recon.org_id,
      lease_id: leaseId,
      transaction_type: "deposit_refund",
      direction: "debit",
      amount_cents: recon.refund_to_tenant_cents,
      description: `Deposit refund to tenant — ${tenantName}`,
      created_by: agentId,
    })
  }

  // 2. Deductions to landlord
  if (recon.deductions_to_landlord_cents > 0) {
    await supabase.from("deposit_transactions").insert({
      org_id: recon.org_id,
      lease_id: leaseId,
      tenant_id: recon.tenant_id,
      transaction_type: "deduction_paid_to_landlord",
      direction: "debit",
      amount_cents: recon.deductions_to_landlord_cents,
      description: `Deposit deductions to landlord`,
      reference: refPrefix,
      created_by: agentId,
    })

    await supabase.from("trust_transactions").insert({
      org_id: recon.org_id,
      lease_id: leaseId,
      transaction_type: "deposit_deduction",
      direction: "credit",
      amount_cents: recon.deductions_to_landlord_cents,
      description: `Deposit deductions received`,
      created_by: agentId,
    })
  }

  // 3. Check for forfeited deposit
  if (recon.refund_to_tenant_cents === 0 && recon.total_deductions_cents === 0 && recon.deposit_held_cents > 0) {
    await supabase.from("deposit_reconciliations").update({
      is_forfeited: true,
      sars_taxable_flagged: true,
      forfeiture_reason: "Tenant did not claim refund within statutory period",
    }).eq("lease_id", leaseId)
  }

  // 4. Mark complete
  await supabase.from("deposit_reconciliations").update({
    status: "refunded",
    tenant_refund_paid_at: now.toISOString(),
    tenant_refund_reference: refPrefix,
    updated_at: now.toISOString(),
  }).eq("lease_id", leaseId)

  await supabase.from("deposit_timers").update({
    status: "completed",
    completed_at: now.toISOString(),
  }).eq("lease_id", leaseId).eq("status", "running")

  // Audit log
  await supabase.from("audit_log").insert({
    org_id: recon.org_id,
    table_name: "deposit_reconciliations",
    record_id: recon.id,
    action: "UPDATE",
    changed_by: agentId,
    new_values: {
      status: "refunded",
      refund: formatZAR(recon.refund_to_tenant_cents),
      deductions: formatZAR(recon.deductions_to_landlord_cents),
    },
  })

  return { success: true }
}
