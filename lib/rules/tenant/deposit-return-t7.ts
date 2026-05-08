/**
 * lib/rules/tenant/deposit-return-t7.ts — Deposit return T-7 alert rule
 *
 * Notes:  Fires 7 days before the deposit return deadline for each active lease.
 *         Deadline = leases.end_date + leases.deposit_return_days (configured per lease).
 *         Entity-level dedup: one alert per deposit_reconciliation.id — uses
 *         hasBeenActionedFor() so one lease firing does not block others in the same org.
 */
import type { OrgRule } from "../types"
import { hasBeenActionedFor } from "../engine"

const RULE_ID = "deposit-return-t7"
const ALERT_DAYS = 7

export const depositReturnT7Rule: OrgRule = {
  id:          RULE_ID,
  domain:      "tenant",
  description: "Alert agent 7 days before deposit return deadline per lease",
  scope:       "org",
  frequency:   "daily",
  tags:        ["deposit", "compliance", "deadline"],

  async condition({ supabase, org, now }) {
    const { data: recons, error } = await supabase
      .from("deposit_reconciliations")
      .select("id, lease_id, leases!inner(end_date, deposit_return_days)")
      .eq("org_id", org.id)
      .not("status", "in", "(refunded,finalised,overdue)")

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

      const daysToDeadline = Math.ceil((deadline.getTime() - now.getTime()) / 86_400_000)
      if (daysToDeadline !== ALERT_DAYS) continue

      const alreadySent = await hasBeenActionedFor(supabase, RULE_ID, recon.id)
      if (!alreadySent) return true
    }

    return false
  },

  async action({ supabase, org, now }) {
    const { data: recons, error } = await supabase
      .from("deposit_reconciliations")
      .select("id, lease_id, leases!inner(end_date, deposit_return_days, units(full_address))")
      .eq("org_id", org.id)
      .not("status", "in", "(refunded,finalised,overdue)")

    if (error || !recons?.length) return { summary: "No qualifying leases", count: 0 }

    const actioned: string[] = []

    for (const recon of recons) {
      const lease = recon.leases as unknown as { end_date: string; deposit_return_days: number; units: { full_address: string } | null }
      if (!lease?.end_date) continue

      const deadline = new Date(lease.end_date)
      deadline.setDate(deadline.getDate() + (lease.deposit_return_days ?? 14))

      const daysToDeadline = Math.ceil((deadline.getTime() - now.getTime()) / 86_400_000)
      if (daysToDeadline !== ALERT_DAYS) continue

      const alreadySent = await hasBeenActionedFor(supabase, RULE_ID, recon.id)
      if (alreadySent) continue

      actioned.push(recon.id)
    }

    if (!actioned.length) return { summary: "All eligible leases already alerted", count: 0 }

    return {
      summary: `T-7 deposit return alert for ${actioned.length} lease(s)`,
      count:   actioned.length,
      data:    { entity_id: actioned[0], lease_ids: actioned },
    }
  },
}
