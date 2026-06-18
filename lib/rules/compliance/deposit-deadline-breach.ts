/**
 * lib/rules/compliance/deposit-deadline-breach.ts — Deposit return deadline breach alert
 *
 * Notes:  Fires when the statutory deposit-return window has expired and the reconciliation is not yet
 *         refunded. Legal-exposure rule — no cooldown; entity-level dedup per deposit_reconciliation.id.
 *         Status 'overdue' is NOT excluded from condition — this may run before status is set to overdue.
 *
 *         RHA deadline is a MATRIX, not a flat count (counsel 2026-06-13, ADDENDUM_70B §A; O-15). Resolved
 *         from the reconciliation's own data via resolveDepositReturnDays():
 *           • no deductions + a joint inspection happened → s5(3)(g)(i): 7 days (+ interest)
 *           • no deductions + no inspection (landlord failed to inspect) → s5(3)(g)(ii): 14 days, full refund
 *           • deductions claimed → s5(7): 14 days FROM RESTORATION
 *         Two documented limitations (no schema for them yet — see O-15 follow-up): (a) s5(7) runs from the
 *         restoration date, which isn't captured — we use lease end + 14 as a CONSERVATIVE EARLY bound (the
 *         alarm may fire before the true statutory deadline, never after); (b) the s5(3)(g)(iii) 21-day
 *         tenant-no-show case isn't distinguishable from the data, so it's not modelled (folds into the
 *         scenarios above — also early-biased, which is safe for a breach alarm).
 *
 *         ⚠ COMMENCEMENT WATCH (RHA): these windows cite the principal Act §5 because the Rental Housing
 *         Amendment Act 35 of 2014 is NOT in force (no presidential proclamation as of 2026-06-18). If it
 *         is proclaimed, the citations + windows migrate §5 → §4A/4B together with the deposit clause
 *         (migration 011) and the F-1 matrix (lib/comms/templates/legalCitations.ts), with the s21 6-month
 *         transition. Until then, §5 stands.
 */
import type { OrgRule } from "../types"
import { hasBeenActionedFor } from "../engine"

const RULE_ID = "deposit-deadline-breach"

export type DepositReturnScenario = "no_damage_inspected" | "no_inspection" | "damages_claimed"

export interface DepositReconForDeadline {
  total_deductions_cents?: number | null
  inspection_id?: string | null
}

/**
 * Statutory return window in days, derived from the reconciliation's deduction + inspection state.
 * Pure — exported for unit testing. See the file header for the RHA basis + the two documented limitations.
 */
export function resolveDepositReturnDays(recon: DepositReconForDeadline): { days: number; scenario: DepositReturnScenario } {
  const deductions = recon.total_deductions_cents ?? 0
  if (deductions === 0) {
    return recon.inspection_id
      ? { days: 7, scenario: "no_damage_inspected" }   // s5(3)(g)(i)
      : { days: 14, scenario: "no_inspection" }         // s5(3)(g)(ii)
  }
  return { days: 14, scenario: "damages_claimed" }      // s5(7) — early bound (restoration date not captured)
}

/** Deadline = lease end + the statutory window for the reconciliation's scenario. */
function depositDeadline(endDate: string, recon: DepositReconForDeadline): Date {
  const d = new Date(endDate)
  d.setDate(d.getDate() + resolveDepositReturnDays(recon).days)
  return d
}

export const depositDeadlineBreachRule: OrgRule = {
  id:          RULE_ID,
  domain:      "compliance",
  description: "Flag when deposit return window has expired without refund — legal exposure",
  scope:       "org",
  frequency:   "daily",
  tags:        ["deposit", "compliance", "breach", "legal"],

  async condition({ supabase, org, now }) {
    const { data: recons, error } = await supabase
      .from("deposit_reconciliations")
      .select("id, total_deductions_cents, inspection_id, leases!inner(end_date)")
      .eq("org_id", org.id)
      .not("status", "in", "(refunded,finalised)")

    if (error) {
      console.error(`[${RULE_ID}] condition query failed:`, error.message)
      return false
    }
    if (!recons?.length) return false

    for (const recon of recons) {
      const lease = recon.leases as unknown as { end_date: string }
      if (!lease?.end_date) continue

      if (now <= depositDeadline(lease.end_date, recon)) continue // deadline not yet passed

      const alreadyFlagged = await hasBeenActionedFor(supabase, RULE_ID, recon.id)
      if (!alreadyFlagged) return true
    }

    return false
  },

  async action({ supabase, org, now }) {
    const { data: recons, error } = await supabase
      .from("deposit_reconciliations")
      .select("id, status, total_deductions_cents, inspection_id, leases!inner(end_date)")
      .eq("org_id", org.id)
      .not("status", "in", "(refunded,finalised)")

    if (error || !recons?.length) return { summary: "No qualifying leases", count: 0 }

    const breached: string[] = []

    for (const recon of recons) {
      const lease = recon.leases as unknown as { end_date: string }
      if (!lease?.end_date) continue

      if (now <= depositDeadline(lease.end_date, recon)) continue

      const alreadyFlagged = await hasBeenActionedFor(supabase, RULE_ID, recon.id)
      if (alreadyFlagged) continue

      // Mark as overdue if not already
      if (recon.status !== "overdue") {
        await supabase
          .from("deposit_reconciliations")
          .update({ status: "overdue" })
          .eq("id", recon.id)
      }

      breached.push(recon.id)
    }

    if (!breached.length) return { summary: "All breach cases already flagged", count: 0 }

    return {
      summary: `Deposit return deadline breached on ${breached.length} lease(s)`,
      count:   breached.length,
      data:    { entity_id: breached[0], reconciliation_ids: breached },
    }
  },
}
