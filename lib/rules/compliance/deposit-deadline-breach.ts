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
 *         Restoration anchor (O-21): the s5(7) damages window runs from RESTORATION of the property. When a
 *         move-out inspection exists (recon.inspection_id → inspections, type 'move_out') its conducted_date
 *         IS that restoration anchor and the deadline counts from it; otherwise we fall back to lease end as a
 *         CONSERVATIVE EARLY bound (the alarm may fire before the true statutory deadline, never after). The
 *         breach action also surfaces interest_accrued_cents — a late refund owes deposit PLUS accrued interest.
 *         One documented limitation remains: the s5(3)(g)(iii) 21-day tenant-no-show case isn't distinguishable
 *         from the data (the only proxy, inspections.tenant_present, can't tell a tenant no-show from a landlord
 *         who never inspected), so it's not modelled — it folds into the scenarios above, also early-biased,
 *         which is safe for a breach alarm. It pairs naturally with a real "did not attend exit inspection"
 *         flag captured at move-out, if that's ever added.
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
  return { days: 14, scenario: "damages_claimed" }      // s5(7) — 14 days FROM RESTORATION (anchored below)
}

/**
 * Deadline = anchor + the statutory window for the reconciliation's scenario.
 * Anchor (O-21) = the move-out inspection's conducted_date (the point of restoration/handback that s5(7)
 * runs from) when a move-out inspection exists, else lease end as a conservative EARLY bound. On an early
 * handback the inspection date precedes lease end, so anchoring on it fires the alarm at the true statutory
 * deadline instead of late — the one direction that matters for a breach alarm.
 */
export function depositDeadline(endDate: string, moveOutConductedDate: string | null, recon: DepositReconForDeadline): Date {
  const d = new Date(moveOutConductedDate ?? endDate)
  d.setDate(d.getDate() + resolveDepositReturnDays(recon).days)
  return d
}

/**
 * The restoration anchor from the reconciliation's linked inspection: its conducted_date, but ONLY when the
 * linked inspection is the move-out one (recon.inspection_id can point at any inspection type). Null → the
 * caller falls back to lease end. The embed is a many-to-one FK, so Supabase returns a single object or null.
 */
export function moveOutConductedDate(inspections: unknown): string | null {
  const insp = inspections as { conducted_date: string | null; inspection_type: string } | null
  return insp?.inspection_type === "move_out" ? insp.conducted_date : null
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
      .select("id, total_deductions_cents, inspection_id, leases!inner(end_date), inspections(conducted_date, inspection_type)")
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

      if (now <= depositDeadline(lease.end_date, moveOutConductedDate(recon.inspections), recon)) continue // deadline not yet passed

      const alreadyFlagged = await hasBeenActionedFor(supabase, RULE_ID, recon.id)
      if (!alreadyFlagged) return true
    }

    return false
  },

  async action({ supabase, org, now }) {
    const { data: recons, error } = await supabase
      .from("deposit_reconciliations")
      .select("id, status, total_deductions_cents, interest_accrued_cents, inspection_id, leases!inner(end_date), inspections(conducted_date, inspection_type)")
      .eq("org_id", org.id)
      .not("status", "in", "(refunded,finalised)")

    if (error || !recons?.length) return { summary: "No qualifying leases", count: 0 }

    const breached: string[] = []
    let totalInterestCents = 0   // a late refund owes deposit + accrued interest (O-21) — surface it

    for (const recon of recons) {
      const lease = recon.leases as unknown as { end_date: string }
      if (!lease?.end_date) continue

      if (now <= depositDeadline(lease.end_date, moveOutConductedDate(recon.inspections), recon)) continue

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
      totalInterestCents += recon.interest_accrued_cents ?? 0
    }

    if (!breached.length) return { summary: "All breach cases already flagged", count: 0 }

    const interestNote = totalInterestCents > 0 ? ` (incl. R${(totalInterestCents / 100).toFixed(2)} accrued interest owed)` : ""
    return {
      summary: `Deposit return deadline breached on ${breached.length} lease(s)${interestNote}`,
      count:   breached.length,
      data:    { entity_id: breached[0], reconciliation_ids: breached, interest_accrued_cents: totalInterestCents },
    }
  },
}
