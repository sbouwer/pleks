/**
 * lib/trust/invariants.ts — Runtime enforcement of D-TRUST-01: Pleks is not the trustee.
 *
 * Auth:  Internal — called from server actions and API routes only.
 * Notes: recordTrustTransaction() is the SINGLE insert path for trust_transactions (ADDENDUM_FINANCIAL_INTEGRITY
 *        F-3, shipped) — all 13 write sites route through it, so assertPleksIsNotTrustee() runs on every trust
 *        write and source/initiated_by are real, persisted columns. The invariant-coverage ratchet enforces
 *        "no direct trust_transactions inserts outside this file" (a new one fails the build). This code-level
 *        guard sits ON TOP of the structural guarantee (bank_accounts.type CHECK, no Pleks org + the ESLint
 *        payment-SDK import ban). See brief/legal/TRUST_ACCOUNT_POSITIONING.md §3.2.
 */
import * as Sentry from "@sentry/nextjs"
import { createServiceClient } from "@/lib/supabase/server"

export type TrustOperationDirection = "inbound" | "outbound"
export type TrustOperationSource = "agency_bank" | "tenant_initiated" | "pleks_controlled_account"
export type TrustOperationInitiator = "agent" | "tenant" | "pleks_system"

export interface TrustOperation {
  orgId: string
  direction: TrustOperationDirection
  source: TrustOperationSource
  initiatedBy: TrustOperationInitiator
  amountCents: number
  description: string
}

export class SovereignTrustViolation extends Error {
  constructor(rule: string, operation: TrustOperation) {
    super(
      `SOVEREIGN_TRUST_VIOLATION: ${rule}. ` +
      `Operation: direction=${operation.direction}, source=${operation.source}, ` +
      `initiatedBy=${operation.initiatedBy}. ` +
      `See brief/legal/TRUST_ACCOUNT_POSITIONING.md.`
    )
    this.name = "SovereignTrustViolation"
  }
}

export function assertPleksIsNotTrustee(op: TrustOperation): void {
  // Rule 1: Pleks never controls a trust account.
  if (op.source === "pleks_controlled_account") {
    const err = new SovereignTrustViolation(
      "Pleks does not control any bank account capable of holding client funds",
      op,
    )
    Sentry.captureException(err, { tags: { invariant: "trust_sovereignty" } })
    throw err
  }

  // Rule 2: Pleks never initiates outbound fund movement.
  // Outbound movements must be agent-initiated — never a Pleks cron or background job.
  if (op.direction === "outbound" && op.initiatedBy === "pleks_system") {
    const err = new SovereignTrustViolation(
      "Pleks system processes cannot initiate outbound fund movement",
      op,
    )
    Sentry.captureException(err, { tags: { invariant: "trust_sovereignty" } })
    throw err
  }

}

export type TrustTransactionType =
  | "rent_received"
  | "deposit_received"
  | "deposit_interest"
  | "expense_paid"
  | "management_fee"
  | "owner_payment"
  | "deposit_returned"
  | "deposit_deduction"
  | "adjustment"
  | "maintenance_expense"

interface RecordTrustTransactionParams {
  orgId: string
  transactionType: TrustTransactionType
  direction: "credit" | "debit"
  amountCents: number
  description: string
  source: TrustOperationSource
  initiatedBy: TrustOperationInitiator
  // Optional relational fields
  propertyId?: string
  unitId?: string
  leaseId?: string
  ownerRef?: string
  reference?: string
  invoiceId?: string
  supplierInvoiceId?: string
  statementMonth?: string  // ISO date 'YYYY-MM-DD'
  isOpeningBalance?: boolean
  createdBy?: string
  maintenanceRequestId?: string
  paymentMethod?: string
}

export async function recordTrustTransaction(
  params: RecordTrustTransactionParams
): Promise<{ id: string }> {
  const invariantDirection: TrustOperationDirection =
    params.direction === "credit" ? "inbound" : "outbound"

  assertPleksIsNotTrustee({
    orgId: params.orgId,
    direction: invariantDirection,
    source: params.source,
    initiatedBy: params.initiatedBy,
    amountCents: params.amountCents,
    description: params.description,
  })

  const db = await createServiceClient()
  const { data, error } = await db
    .from("trust_transactions")
    .insert({
      org_id:               params.orgId,
      transaction_type:     params.transactionType,
      direction:            params.direction,
      amount_cents:         params.amountCents,
      description:          params.description,
      property_id:          params.propertyId ?? null,
      unit_id:              params.unitId ?? null,
      lease_id:             params.leaseId ?? null,
      owner_ref:            params.ownerRef ?? null,
      reference:            params.reference ?? null,
      invoice_id:           params.invoiceId ?? null,
      supplier_invoice_id:  params.supplierInvoiceId ?? null,
      statement_month:      params.statementMonth ?? null,
      is_opening_balance:   params.isOpeningBalance ?? false,
      created_by:           params.createdBy ?? null,
      maintenance_request_id: params.maintenanceRequestId ?? null,
      payment_method:       params.paymentMethod ?? null,
      source:               params.source,
      initiated_by:         params.initiatedBy,
    })
    .select("id")
    .single()

  if (error) {
    console.error("[recordTrustTransaction] insert failed:", error.message)
    throw error
  }
  return { id: data.id }
}
