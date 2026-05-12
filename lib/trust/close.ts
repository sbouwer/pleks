/**
 * lib/trust/close.ts — Trust period close server action
 *
 * Auth:   requireAgentWriteAccess + trust_account_write step-up
 * Notes:  Writing a signed_off period is a professional-liability act. IP, user,
 *         and timestamp are captured. The DB trigger enforces immutability of
 *         trust_transactions in closed periods (SOVEREIGN_TRUST_VIOLATION).
 */
"use server"

import { headers } from "next/headers"
import { requireAgentWriteAccess } from "@/lib/auth/server"
import { requireStepUp } from "@/lib/auth/step-up"
import { createServiceClient } from "@/lib/supabase/server"
import { generateAuditExport } from "@/lib/trust/audit-export"

export interface OutstandingItem {
  description: string
  amount_cents: number
  expected_clear_date: string  // ISO date
  item_type: "deposit_in_transit" | "pending_clearing" | "uncleared_eft" | "other"
}

interface CloseTrustPeriodParams {
  bankAccountId: string
  periodStart: string   // ISO date 'YYYY-MM-DD'
  periodEnd: string     // ISO date 'YYYY-MM-DD'
  bankClosingBalanceCents: number
  ledgerClosingBalanceCents: number
  reconComputedClosingCents: number
  varianceCents: number
  varianceAcknowledged: boolean
  outstandingItems: OutstandingItem[]
  signedOffNotes: string | null
  bankReconSessionId: string  // session row to update after close
  stepUpToken: string | null | undefined
}

type CloseTrustPeriodResult =
  | { ok: true; periodId: string }
  | { ok: false; stepUpChallenge: string }
  | { ok: false; error: string }

export async function closeTrustPeriod(
  params: CloseTrustPeriodParams
): Promise<CloseTrustPeriodResult> {
  const gw = await requireAgentWriteAccess("close_trust_period")
  const { orgId, userId } = gw

  const stepUp = await requireStepUp({
    userId,
    action: "trust_account_write",
    resourceId: params.bankAccountId,
    providedToken: params.stepUpToken,
  })
  if (!stepUp.verified) {
    return { ok: false, stepUpChallenge: stepUp.challengeToken }
  }

  const hdrs = await headers()
  const ip =
    hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    hdrs.get("x-real-ip") ??
    "unknown"

  const db = await createServiceClient()

  const { data: period, error: periodErr } = await db
    .from("trust_reconciliation_periods")
    .insert({
      org_id:                        orgId,
      bank_account_id:               params.bankAccountId,
      period_start:                  params.periodStart,
      period_end:                    params.periodEnd,
      bank_closing_balance_cents:    params.bankClosingBalanceCents,
      ledger_closing_balance_cents:  params.ledgerClosingBalanceCents,
      recon_computed_closing_cents:  params.reconComputedClosingCents,
      variance_cents:                params.varianceCents,
      variance_acknowledged:         params.varianceAcknowledged,
      outstanding_items:             params.outstandingItems,
      signed_off_notes:              params.signedOffNotes,
      signed_off_by:                 userId,
      signed_off_at:                 new Date().toISOString(),
      signed_off_ip:                 ip,
      status:                        "signed_off",
    })
    .select("id")
    .single()

  if (periodErr) {
    console.error("[closeTrustPeriod] period insert failed:", periodErr.message)
    return { ok: false, error: periodErr.message }
  }

  const { error: sessionErr } = await db
    .from("bank_recon_sessions")
    .update({
      status:       "signed_off",
      signed_off_at: new Date().toISOString(),
      signed_off_by: userId,
      period_id:    period.id,
    })
    .eq("id", params.bankReconSessionId)
    .eq("org_id", orgId)

  if (sessionErr) {
    console.error("[closeTrustPeriod] session update failed:", sessionErr.message)
    // Non-fatal — period is already written; log and continue
  }

  // Generate audit export — non-fatal; can be regenerated from the audit page
  generateAuditExport({ periodId: period.id, orgId, userId }).catch(err => {
    console.error("[closeTrustPeriod] audit export generation failed:", (err as Error).message)
  })

  return { ok: true, periodId: period.id }
}
