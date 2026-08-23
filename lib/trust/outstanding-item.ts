/**
 * lib/trust/outstanding-item.ts — one reconciling item carried across a trust-period close
 *
 * Data:   trust_periods.outstanding_items (jsonb), captured on the close screen and replayed into
 *         the audit export and PDF. This module declares the shape only.
 * Notes:  Lives apart from close.ts so audit-export.ts can name the type without importing the
 *         module that calls it — close.ts imports generateAuditExport as a VALUE, so the pair was
 *         a cycle that survived only because the return edge was type-only. Splitting it also
 *         keeps the client close screen from reaching a type through a server-only module.
 */
export interface OutstandingItem {
  description: string
  amount_cents: number
  expected_clear_date: string  // ISO date
  item_type: "deposit_in_transit" | "pending_clearing" | "uncleared_eft" | "other"
}
