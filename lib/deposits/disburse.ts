"use server"

/**
 * lib/deposits/disburse.ts — deposit disbursement: refund to tenant, damage deductions, charge settlements
 *
 * Auth:   gateway() — authenticates + provides the caller's orgId. Deliberately NOT
 *         requireAgentWriteAccess: returning a tenant's deposit fulfils a statutory RHA obligation, not
 *         net-new value creation, so it must work even when the subscription is paused/cancelled ("Your
 *         Data, Always"; allowlisted in the server-action census as an intentional gateway()-on-write).
 *         The reconciliation read is org-scoped, so a foreign leaseId matches nothing (a caller from org A
 *         cannot disburse org B's deposit). recorded_by is the session userId, never a caller arg.
 *         (Caller-ID census hotfix: this action was previously ungated + cross-org + attribution-forgeable.)
 * Data:   deposit_reconciliations, deposit_charges, deposit_transactions, trust_transactions,
 *         payments, rent_invoices, arrears_cases via service client
 * Notes:  ADDENDUM_63B: three settlement patterns for deposit_charges before disbursement.
 *         Pattern A — tenant-debt: inserts a deposit_offset payment + allocate_payment_atomic() (clause 6.6).
 *         Pattern B — cost recovery: settle_deposit_charge_atomic (deposit debit + trust credit + charge link, 1 tx).
 *         Pattern C — ad-hoc: settle_deposit_charge_atomic (deposit debit + charge link, 1 tx; no trust).
 *         Pre-flight validation runs before any DB writes (fail-fast). Each settlement pattern AND the main
 *         disbursement (refund/deductions/forfeiture/recon/timer via disburse_deposit_atomic) are atomic RPCs,
 *         so a failed trust posting rolls that unit back — no committed deposit debit without its trust credit.
 *         BUILD_63 Phase 3: fires deposit.returned (mandatory) after status → refunded.
 */
import * as React from "react"
import { gateway } from "@/lib/supabase/gateway"
import { createServiceClient } from "@/lib/supabase/server"
import { formatZAR } from "@/lib/constants"
import { routeAndSend } from "@/lib/messaging/router"
import { fetchOrgSettings, buildBranding } from "@/lib/comms/send-email"
import { DepositReturnedEmail } from "@/lib/comms/templates/tenant/deposits/deposit-returned"
import { fmtDateLongZA } from "@/lib/dates"
import { recordAudit } from "@/lib/audit/recordAudit"

// ─── Types ────────────────────────────────────────────────────────────────────

interface DepositCharge {
  id: string
  org_id: string
  lease_id: string
  tenant_id?: string | null
  charge_type: string
  description: string
  deduction_amount_cents: number
  source_invoice_id: string | null
  source_arrears_case_id: string | null
  source_supplier_invoice_id: string | null
  source_municipal_bill_id: string | null
  source_lease_charge_id: string | null
  settling_payment_id: string | null
  settling_deposit_txn_id: string | null
}

// Log-only guard for Supabase query errors (keeps call sites flat — no control-flow change)
function logIfError(label: string, error: { message: string } | null) {
  if (error) console.error(`${label}:`, error.message)
}

// ─── Pre-flight validation (split by pattern to stay within complexity budget) ─

type Supabase = Awaited<ReturnType<typeof createServiceClient>>

async function validatePatternA(supabase: Supabase, charge: DepositCharge): Promise<string | null> {
  if (charge.source_invoice_id) {
    const { data: inv, error: invError } = await supabase.from("rent_invoices").select("balance_cents, status").eq("id", charge.source_invoice_id).single()
    if (invError) console.error("validatePatternA rent_invoices read failed:", invError.message)
    if (!inv) return `Deposit charge "${charge.description}": linked invoice not found`
    if (!["open", "partial", "overdue"].includes(inv.status as string)) return `Deposit charge "${charge.description}": linked invoice is already paid or cancelled`
    if ((inv.balance_cents as number) < charge.deduction_amount_cents) return `Deposit charge "${charge.description}": invoice balance R ${((inv.balance_cents as number) / 100).toFixed(2)} is less than charge amount R ${(charge.deduction_amount_cents / 100).toFixed(2)}`
  }
  if (charge.source_arrears_case_id) {
    const { data: ac, error: acError } = await supabase.from("arrears_cases").select("total_arrears_cents, status").eq("id", charge.source_arrears_case_id).single()
    if (acError) console.error("validatePatternA arrears_cases read failed:", acError.message)
    if (!ac) return `Deposit charge "${charge.description}": linked arrears case not found`
    if ((ac.status as string) === "resolved") return `Deposit charge "${charge.description}": arrears case is already resolved`
    if ((ac.total_arrears_cents as number) < charge.deduction_amount_cents) return `Deposit charge "${charge.description}": arrears balance R ${((ac.total_arrears_cents as number) / 100).toFixed(2)} is less than charge amount R ${(charge.deduction_amount_cents / 100).toFixed(2)} — recompute the charge`
  }
  return null
}

async function validatePatternB(supabase: Supabase, charge: DepositCharge): Promise<string | null> {
  if (charge.source_supplier_invoice_id) {
    const { data: si, error: siError } = await supabase.from("supplier_invoices").select("status").eq("id", charge.source_supplier_invoice_id).single()
    if (siError) console.error("validatePatternB supplier_invoices read failed:", siError.message)
    if (!si) return `Deposit charge "${charge.description}": linked supplier invoice not found`
    if ((si.status as string) !== "paid") return `Deposit charge "${charge.description}": supplier invoice must be paid before recovering from deposit`
  }
  if (charge.source_municipal_bill_id) {
    const { data: mb, error: mbError } = await supabase.from("municipal_bills").select("payment_status").eq("id", charge.source_municipal_bill_id).single()
    if (mbError) console.error("validatePatternB municipal_bills read failed:", mbError.message)
    if (!mb) return `Deposit charge "${charge.description}": linked municipal bill not found`
    if ((mb.payment_status as string) !== "paid") return `Deposit charge "${charge.description}": municipal bill must be paid before recovering from deposit`
  }
  return null
}

async function validateChargesPreFlight(supabase: Supabase, charges: DepositCharge[]): Promise<{ error?: string }> {
  for (const charge of charges) {
    const isPatternA = !!(charge.source_arrears_case_id || charge.source_invoice_id || charge.source_lease_charge_id)
    const isPatternB = !!(charge.source_supplier_invoice_id || charge.source_municipal_bill_id)
    const errA = isPatternA ? await validatePatternA(supabase, charge) : null
    if (errA) return { error: errA }
    const errB = isPatternB ? await validatePatternB(supabase, charge) : null
    if (errB) return { error: errB }
  }
  return {}
}

// ─── Settlement patterns ──────────────────────────────────────────────────────

async function settlePatternA(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  charge: DepositCharge,
  recon: { org_id: string; lease_id: string; tenant_id: string },
  actorId: string
) {
  // Deposit-offset payment + clause-6.6 allocation (allocate_payment_atomic) + deposit-side debit + arrears
  // recompute + charge link, all in ONE transaction (ledger — Pattern A fold). Was five separate awaits: a
  // failure after the payment/allocation left the charge unlinked, so a re-run re-inserted the payment +
  // re-allocated = double deposit consumption. The RPC rolls the whole settlement back on any failure.
  const { error } = await supabase.rpc("settle_deposit_charge_pattern_a_atomic", {
    p_org_id:          recon.org_id,
    p_lease_id:        recon.lease_id,
    p_tenant_id:       recon.tenant_id,
    p_charge_id:       charge.id,
    p_amount_cents:    charge.deduction_amount_cents,
    p_description:     charge.description,
    p_actor:           actorId,
    p_arrears_case_id: charge.source_arrears_case_id,
  })
  if (error) throw new Error(`Pattern A settlement failed for charge "${charge.description}": ${error.message}`)
}

async function settlePatternB(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  charge: DepositCharge,
  recon: { org_id: string; lease_id: string; tenant_id: string },
  actorId: string
) {
  const sourceLabel = charge.source_supplier_invoice_id
    ? `supplier invoice ${charge.source_supplier_invoice_id.slice(0, 8).toUpperCase()}`
    : `municipal bill ${charge.source_municipal_bill_id?.slice(0, 8).toUpperCase()}`

  // deposit debit + trust deposit_deduction credit + charge link in ONE transaction (ledger 4b). Was: a
  // deposit_transactions insert THEN a throwable recordTrustTransaction — a failed trust post left a committed
  // deposit debit with no trust credit (D-TRUST-01 imbalance). Now they commit together or roll back together.
  const { error } = await supabase.rpc("settle_deposit_charge_atomic", {
    p_org_id:            recon.org_id,
    p_lease_id:          recon.lease_id,
    p_tenant_id:         recon.tenant_id,
    p_charge_id:         charge.id,
    p_amount_cents:      charge.deduction_amount_cents,
    p_dep_description:   `${charge.description} — cost recovery (${sourceLabel})`,
    p_actor:             actorId,
    p_with_trust:        true,
    p_trust_description: `${charge.description} — cost recovery from deposit (${sourceLabel})`,
  })
  if (error) throw new Error(`Pattern B settlement failed for charge "${charge.description}": ${error.message}`)
}

async function settlePatternC(
  supabase: Awaited<ReturnType<typeof createServiceClient>>,
  charge: DepositCharge,
  recon: { org_id: string; lease_id: string; tenant_id: string },
  actorId: string
) {
  // deposit debit + charge link in ONE transaction (ledger 4b). Was: a deposit_transactions insert THEN a
  // separate settling_deposit_txn_id update — a failure between them left the charge unlinked, so a re-run
  // re-inserted the debit (double-settle). No trust post for ad-hoc charges (p_with_trust omitted → false).
  const { error } = await supabase.rpc("settle_deposit_charge_atomic", {
    p_org_id:          recon.org_id,
    p_lease_id:        recon.lease_id,
    p_tenant_id:       recon.tenant_id,
    p_charge_id:       charge.id,
    p_amount_cents:    charge.deduction_amount_cents,
    p_dep_description: charge.description,
    p_actor:           actorId,
  })
  if (error) throw new Error(`Pattern C settlement failed for charge "${charge.description}": ${error.message}`)
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function disburseDeposit(leaseId: string) {
  // Lockdown-free BY DESIGN: returning a tenant's deposit fulfils a statutory obligation (Rental Housing
  // Act — refund within the prescribed period), NOT net-new value creation, so a paused/cancelled agency
  // MUST still be able to disburse ("Your Data, Always"). gateway() keeps the full IDOR fix (auth + orgId
  // scope + session userId) and drops only the subscription lockdown. Allowlisted in server-action-census.
  const gw = await gateway()
  if (!gw) return { error: "Not authenticated" }
  const { db: supabase, orgId, userId } = gw

  const { data: recon, error: reconErr } = await supabase
    .from("deposit_reconciliations")
    .select(`
      id, org_id, lease_id, tenant_id,
      refund_to_tenant_cents, deductions_to_landlord_cents,
      deposit_held_cents, total_deductions_cents
    `)
    .eq("lease_id", leaseId)
    .eq("org_id", orgId)
    .single()

  if (reconErr || !recon) return { error: "Reconciliation not found" }

  // Fetch confirmed, unsettled charges (settling_deposit_txn_id IS NULL means not yet processed)
  const { data: charges, error: chargesErr } = await supabase
    .from("deposit_charges")
    .select("id, org_id, lease_id, charge_type, description, deduction_amount_cents, source_invoice_id, source_arrears_case_id, source_supplier_invoice_id, source_municipal_bill_id, source_lease_charge_id, settling_payment_id, settling_deposit_txn_id")
    .eq("lease_id", leaseId)
    .eq("org_id", recon.org_id)
    .eq("agent_confirmed", true)
    .is("settling_deposit_txn_id", null)

  if (chargesErr) return { error: chargesErr.message }

  // Pre-flight: validate all charges before any DB writes
  if ((charges ?? []).length > 0) {
    const preflight = await validateChargesPreFlight(supabase, (charges ?? []) as DepositCharge[])
    if (preflight.error) return { error: preflight.error }
  }

  // Settle each charge via the appropriate pattern
  try {
    for (const charge of (charges ?? []) as DepositCharge[]) {
      const isPatternA = !!(charge.source_arrears_case_id || charge.source_invoice_id || charge.source_lease_charge_id)
      const isPatternB = !!(charge.source_supplier_invoice_id || charge.source_municipal_bill_id)
      const ctx = { org_id: orgId, lease_id: leaseId, tenant_id: recon.tenant_id as string }

      if (isPatternA) {
        await settlePatternA(supabase, charge, ctx, userId)
      } else if (isPatternB) {
        await settlePatternB(supabase, charge, ctx, userId)
      } else {
        await settlePatternC(supabase, charge, ctx, userId)
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Settlement failed"
    return { error: msg }
  }

  // Fetch tenant info for comms
  const { data: tenant, error: tenantError } = await supabase
    .from("tenant_view")
    .select("first_name, last_name, email")
    .eq("id", recon.tenant_id)
    .single()
  logIfError("disburse tenant_view read failed", tenantError)

  const tenantName = tenant ? `${tenant.first_name} ${tenant.last_name}` : "Tenant"

  const { data: leaseUnit, error: leaseUnitError } = await supabase
    .from("leases")
    .select("units(unit_number, properties(address_line1, suburb, city))")
    .eq("id", leaseId)
    .maybeSingle()
  logIfError("disburse leases read failed", leaseUnitError)

  type PropRow = { address_line1: string; suburb: string | null; city: string }
  type UnitRow = { unit_number: string; properties: PropRow | PropRow[] | null }
  const unitRaw = (leaseUnit as unknown as { units: UnitRow | UnitRow[] | null } | null)?.units
  const unitData = Array.isArray(unitRaw) ? unitRaw[0] : unitRaw
  const rawProps = unitData?.properties ?? null
  const propData = Array.isArray(rawProps) ? rawProps[0] : rawProps
  const propertyLabel = propData
    ? [propData.address_line1, `Unit ${unitData?.unit_number}`, propData.suburb ?? propData.city].filter(Boolean).join(", ")
    : leaseId

  const now = new Date()
  const refPrefix = `DEPOSIT-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`

  // Main disbursement sequence (refund + deductions + forfeiture + recon status + timer) in ONE atomic
  // RPC: a failed trust posting now rolls the WHOLE disbursement back. Previously the two trust postings
  // were log-only .catch() calls, so a failed trust insert left a committed deposit debit with no trust
  // credit and the recon still flipped to 'refunded' — a D-TRUST-01 imbalance. The trust inserts inside
  // the RPC fire the sovereignty + closed-period triggers, so the guarantee is enforced at the DB.
  const { error: disburseErr } = await supabase.rpc("disburse_deposit_atomic", {
    p_org_id:      orgId,
    p_lease_id:    leaseId,
    p_actor:       userId,
    p_reference:   refPrefix,
    p_tenant_name: tenantName,
  })
  if (disburseErr) return { error: `Deposit disbursement failed: ${disburseErr.message}` }

  // Audit log
  await recordAudit(supabase, { orgId: orgId, table: "deposit_reconciliations", recordId: recon.id, action: "UPDATE", actorId: userId, after: {
      status:     "refunded",
      refund:     formatZAR(recon.refund_to_tenant_cents as number),
      deductions: formatZAR(recon.deductions_to_landlord_cents as number),
      charges:    (charges ?? []).length,
    } })

  // BUILD_63 Phase 3 — fire deposit.returned (mandatory, RHA s5(3)(g))
  if ((recon.refund_to_tenant_cents as number) > 0 && tenant?.email) {
    try {
      const orgSettings = await fetchOrgSettings(recon.org_id as string)
      const branding    = buildBranding(orgSettings)
      const refundDisplay  = formatZAR(recon.refund_to_tenant_cents as number)
      const disbursedDate  = fmtDateLongZA(now)

      await routeAndSend({
        orgId:          recon.org_id as string,
        tenantId:       recon.tenant_id as string,
        templateKey:    "deposit.returned",
        to:             { email: tenant.email, name: tenantName },
        subject:        `Deposit refund processed — ${refundDisplay}`,
        emailElement:   React.createElement(DepositReturnedEmail, {
          branding,
          tenantName,
          propertyLabel,
          refundAmountDisplay: refundDisplay,
          referenceNumber:     refPrefix,
          disbursedDate,
          senderName:          orgSettings?.name ?? branding.orgName,
        }),
        entityType:        "deposit_reconciliation",
        entityId:          recon.id as string,
        triggerEventType:  "deposit_disbursed",
        triggerEventId:    recon.id as string,
        toneVariant:       "n/a",
      })
    } catch (err) {
      console.error("[disburse] deposit.returned comm failed:", err)
    }
  }

  return { success: true }
}
