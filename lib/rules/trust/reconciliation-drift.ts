/**
 * lib/rules/trust/reconciliation-drift.ts — Trust account reconciliation drift alert
 *
 * Notes:  Fires when no bank statement has been imported (or reconciled) for 14+
 *         calendar days. 14 days is used as a proxy for 10 business days.
 *         Org-level cooldown: 3 days — avoid alert storms if the agent ignores it.
 *         Only fires if the org has at least one bank account (some orgs may not
 *         use the bank feed feature).
 */
import type { OrgRule } from "../types"

const DRIFT_THRESHOLD_MS = 14 * 86_400_000

export const trustReconciliationDriftRule: OrgRule = {
  id:            "trust-reconciliation-drift",
  domain:        "trust",
  description:   "Alert when bank statement not imported for 14+ calendar days",
  scope:         "org",
  frequency:     "daily",
  cooldownDays:  3,
  tags:          ["trust", "reconciliation", "bank-feed", "compliance"],

  async condition({ supabase, org, now }) {
    // Only relevant if org has a linked bank account
    const { count: bankCount } = await supabase
      .from("bank_accounts")
      .select("id", { count: "exact", head: true })
      .eq("org_id", org.id)

    if (!bankCount) return false

    // Find most recent import
    const { data: latest, error } = await supabase
      .from("bank_statement_imports")
      .select("created_at, reconciled_at, reconciled")
      .eq("org_id", org.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      console.error("[trust-reconciliation-drift] query failed:", error.message)
      return false
    }

    // No imports ever — drift from day one
    if (!latest) return true

    const lastActivity = latest.reconciled_at ?? latest.created_at
    const msSinceActivity = now.getTime() - new Date(lastActivity).getTime()
    return msSinceActivity >= DRIFT_THRESHOLD_MS
  },

  async action({ supabase, org, now }) {
    const { data: latest } = await supabase
      .from("bank_statement_imports")
      .select("created_at, reconciled_at, reconciled, balance_discrepancy_cents")
      .eq("org_id", org.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()

    const lastActivity = latest?.reconciled_at ?? latest?.created_at ?? null
    const daysSince = lastActivity
      ? Math.floor((now.getTime() - new Date(lastActivity).getTime()) / 86_400_000)
      : null

    return {
      summary: daysSince
        ? `Trust reconciliation overdue — last activity ${daysSince} days ago`
        : "No bank statement ever imported for this org",
      data: {
        last_activity_at:         lastActivity,
        days_since_activity:      daysSince,
        balance_discrepancy_cents: latest?.balance_discrepancy_cents ?? null,
      },
    }
  },
}
