/**
 * lib/rules/compliance/deposit-deadline-breach.ts — Deposit return deadline breach alert
 *
 * Notes:  Fires when the 14/21-day deposit return window has already expired and the
 *         deposit reconciliation is not yet refunded. Legal exposure rule — no cooldown.
 *         Entity-level dedup: one breach flag per deposit_reconciliation.id.
 *         Status 'overdue' is NOT excluded from condition — this rule may run before
 *         the status is explicitly set to overdue.
 *
 *         ⚠ COMMENCEMENT WATCH (RHA): the 7/14/21-day windows are governed by the Rental Housing Act
 *         50 of 1999 §5(3)(g)/(7) — the principal Act, because the Rental Housing Amendment Act 35 of
 *         2014 is NOT yet in force (no presidential proclamation as of 2026-06-18). If it is ever
 *         proclaimed, these windows + their citations migrate §5 → §4A/4B (with substantive deltas)
 *         and must be re-cited together with the deposit clause (011) and the F-1 citation matrix
 *         (lib/comms/templates/legalCitations.ts). Until then, §5 stands.
 */
import type { OrgRule } from "../types"
import { hasBeenActionedFor } from "../engine"

const RULE_ID = "deposit-deadline-breach"

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
      .select("id, leases!inner(end_date, deposit_return_days)")
      .eq("org_id", org.id)
      .not("status", "in", "(refunded,finalised)")

    if (error) {
      console.error(`[${RULE_ID}] condition query failed:`, error.message)
      return false
    }
    if (!recons?.length) return false

    for (const recon of recons) {
      const lease = recon.leases as unknown as { end_date: string; deposit_return_days: number }
      if (!lease?.end_date) continue

      const deadline = new Date(lease.end_date)
      deadline.setDate(deadline.getDate() + (lease.deposit_return_days ?? 14))

      if (now <= deadline) continue // deadline not yet passed

      const alreadyFlagged = await hasBeenActionedFor(supabase, RULE_ID, recon.id)
      if (!alreadyFlagged) return true
    }

    return false
  },

  async action({ supabase, org, now }) {
    const { data: recons, error } = await supabase
      .from("deposit_reconciliations")
      .select("id, status, leases!inner(end_date, deposit_return_days)")
      .eq("org_id", org.id)
      .not("status", "in", "(refunded,finalised)")

    if (error || !recons?.length) return { summary: "No qualifying leases", count: 0 }

    const breached: string[] = []

    for (const recon of recons) {
      const lease = recon.leases as unknown as { end_date: string; deposit_return_days: number }
      if (!lease?.end_date) continue

      const deadline = new Date(lease.end_date)
      deadline.setDate(deadline.getDate() + (lease.deposit_return_days ?? 14))

      if (now <= deadline) continue

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
