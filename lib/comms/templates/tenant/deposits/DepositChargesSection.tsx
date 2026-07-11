/**
 * lib/comms/templates/tenant/deposits/DepositChargesSection.tsx — non-damage charge rows for deposit return email
 *
 * Data:   DepositChargeItem[] from deposit_charges (non-inspection-derived)
 * Notes:  Co-located with deposit-return-schedule.tsx. Grouped by charge_type so the tenant
 *         sees "Deductions — Rent Arrears", "Deductions — Cleaning", etc. as separate sections.
 */

import * as React from "react"
import { Section, Text } from "@react-email/components"
import type { DepositChargeItem } from "./deposit-return-schedule"
import { formatZAR } from "@/lib/constants"

export const CHARGE_TYPE_LABELS: Record<string, string> = {
  rent_arrears:         "Deductions — Rent Arrears",
  unpaid_utilities:     "Deductions — Unpaid Utilities",
  cleaning:             "Deductions — Cleaning",
  contractual_penalty:  "Deductions — Contractual Penalty",
  lock_replacement:     "Deductions — Lock Replacement",
  key_replacement:      "Deductions — Key Replacement",
  admin_fee:            "Deductions — Administration Fee",
  dilapidation:         "Deductions — Dilapidation",
  fittings_removal:     "Deductions — Fittings Removal",
  early_termination_fee:"Deductions — Early Termination Fee",
  other:                "Deductions — Other",
}

function chargeTypeLabel(t: string): string {
  return CHARGE_TYPE_LABELS[t] ?? "Deductions — " + t.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ")
}

function formatCents(cents: number): string {
  return formatZAR(cents, true)
}

function groupByChargeType(items: DepositChargeItem[]): Record<string, DepositChargeItem[]> {
  const groups: Record<string, DepositChargeItem[]> = {}
  for (const item of items) {
    if (item.deduction_amount_cents <= 0) continue
    const key = item.charge_type
    if (!groups[key]) groups[key] = []
    groups[key].push(item)
  }
  return groups
}

interface DepositChargesSectionProps {
  chargeItems: DepositChargeItem[]
}

export function DepositChargesSection({ chargeItems }: Readonly<DepositChargesSectionProps>) {
  const groups    = groupByChargeType(chargeItems)
  const groupKeys = Object.keys(groups).sort((a, b) => a.localeCompare(b))
  if (groupKeys.length === 0) return null

  return (
    <>
      {groupKeys.map((key) => (
        <Section key={key} style={box}>
          <Text style={sectionHead}>{chargeTypeLabel(key)}</Text>
          {groups[key].map((item) => (
            <Section key={item.id} style={itemRow}>
              <Text style={itemDesc}>{item.description}</Text>
              <Text style={itemAmount}>{formatCents(item.deduction_amount_cents)}</Text>
              {item.notes && (
                <Text style={itemNotes}>{item.notes}</Text>
              )}
            </Section>
          ))}
        </Section>
      ))}
    </>
  )
}

const box:        React.CSSProperties = { background: "#f4f4f5", borderRadius: 6, padding: "12px 16px", margin: "0 0 16px" }
const sectionHead: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "#71717a", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 8px" }
const itemRow:    React.CSSProperties = { borderBottom: "1px solid #e4e4e7", padding: "6px 0" }
const itemDesc:   React.CSSProperties = { fontSize: 13, color: "#3f3f46", margin: "0 0 2px", fontWeight: 600 }
const itemAmount: React.CSSProperties = { fontSize: 13, color: "#ef4444", margin: "0 0 2px", fontWeight: 700 }
const itemNotes:  React.CSSProperties = { fontSize: 12, color: "#71717a", margin: 0, fontStyle: "italic" }
