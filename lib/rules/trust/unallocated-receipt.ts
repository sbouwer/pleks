/**
 * lib/rules/trust/unallocated-receipt.ts — Unallocated bank statement lines alert
 *
 * Notes:  Fires when bank statement lines with match_status='unmatched' are older
 *         than 3 days — short enough to catch fresh issues, avoids noise on imports
 *         that are still being matched. Org-level cooldown: 1 day.
 */
import type { OrgRule } from "../types"

const STALE_AFTER_MS = 3 * 86_400_000

export const unallocatedReceiptRule: OrgRule = {
  id:           "unallocated-receipt-flag",
  domain:       "trust",
  description:  "Flag unmatched bank statement lines older than 3 days",
  scope:        "org",
  frequency:    "daily",
  cooldownDays: 1,
  tags:         ["trust", "bank-feed", "reconciliation"],

  async condition({ supabase, org, now }) {
    const staleFrom = new Date(now.getTime() - STALE_AFTER_MS).toISOString()
    const { count, error } = await supabase
      .from("bank_statement_lines")
      .select("id", { count: "exact", head: true })
      .eq("org_id", org.id)
      .eq("match_status", "unmatched")
      .lt("created_at", staleFrom)

    if (error) {
      console.error("[unallocated-receipt-flag] condition query failed:", error.message)
      return false
    }
    return (count ?? 0) > 0
  },

  async action({ supabase, org, now }) {
    const staleFrom = new Date(now.getTime() - STALE_AFTER_MS).toISOString()
    const { data: lines, error } = await supabase
      .from("bank_statement_lines")
      .select("id, transaction_date, amount_cents, description")
      .eq("org_id", org.id)
      .eq("match_status", "unmatched")
      .lt("created_at", staleFrom)
      .order("transaction_date", { ascending: false })
      .limit(20)

    if (error || !lines?.length) return { summary: "No unallocated lines found", count: 0 }

    return {
      summary: `${lines.length} unmatched bank statement line(s) require allocation`,
      count:   lines.length,
      data:    {
        unmatched_count: lines.length,
        oldest_date:     lines.at(-1)?.transaction_date ?? null,
        newest_date:     lines[0]?.transaction_date ?? null,
      },
    }
  },
}
