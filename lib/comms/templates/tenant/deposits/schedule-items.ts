/**
 * lib/comms/templates/tenant/deposits/schedule-items.ts — line-item shapes and classification labels for the deposit return schedule
 *
 * Data:   deposit_deduction_items and deposit charge rows, as passed into the schedule email.
 * Notes:  Lives apart from deposit-return-schedule.tsx so its two sub-sections can import from it
 *         without importing the template that renders them. The DepositDamageSection edge was a
 *         genuine RUNTIME cycle, not a type-only one: it imports CLASSIFICATION_LABELS, a value,
 *         and worked only on the order Node happened to initialise the two modules in. That is why
 *         the constant moved here rather than staying put with a type-only re-export.
 */

/** Canonical classifications from the deposit_deduction_items.classification CHECK constraint. */
export const CLASSIFICATION_LABELS: Record<string, string> = {
  tenant_damage: "Deductions — Tenant Damage",
  wear_and_tear: "Deductions — Wear & Tear",
  pre_existing:  "Deductions — Pre-existing Condition",
  disputed:      "Deductions — Disputed",
}

export interface DeductionItem {
  id: string
  room: string | null
  item_description: string
  deduction_amount_cents: number
  classification: string
  ai_justification: string | null
}

export interface DepositChargeItem {
  id: string
  charge_type: string
  description: string
  deduction_amount_cents: number
  notes: string | null
}
