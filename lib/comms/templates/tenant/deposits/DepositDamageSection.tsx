/**
 * lib/comms/templates/tenant/deposits/DepositDamageSection.tsx — inspection-damage rows for deposit return email
 *
 * Data:   DeductionItem[] from deposit_deduction_items (inspection-derived)
 * Notes:  Co-located with deposit-return-schedule.tsx. Extracted to keep the schedule
 *         template readable and make each section independently testable.
 */

import * as React from "react"
import { Section, Text } from "@react-email/components"
import { CLASSIFICATION_LABELS, type DeductionItem } from "./deposit-return-schedule"

function classificationLabel(c: string): string {
  if (CLASSIFICATION_LABELS[c]) return CLASSIFICATION_LABELS[c]
  return "Deductions — " + c.split("_").map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ")
}

function formatCents(cents: number): string {
  return "R " + (cents / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2 })
}

function groupByClassification(items: DeductionItem[]): Record<string, DeductionItem[]> {
  const groups: Record<string, DeductionItem[]> = {}
  for (const item of items) {
    if (item.deduction_amount_cents <= 0) continue
    const key = item.classification ?? "other"
    if (!groups[key]) groups[key] = []
    groups[key].push(item)
  }
  return groups
}

interface DepositDamageSectionProps {
  deductionItems: DeductionItem[]
}

export function DepositDamageSection({ deductionItems }: Readonly<DepositDamageSectionProps>) {
  const groups    = groupByClassification(deductionItems)
  const groupKeys = Object.keys(groups).sort((a, b) => a.localeCompare(b))
  if (groupKeys.length === 0) return null

  return (
    <>
      {groupKeys.map((key) => (
        <Section key={key} style={box}>
          <Text style={sectionHead}>{classificationLabel(key)}</Text>
          {groups[key].map((item) => (
            <Section key={item.id} style={itemRow}>
              <Text style={itemDesc}>
                {item.room ? `${item.room}: ` : ""}{item.item_description}
              </Text>
              <Text style={itemAmount}>{formatCents(item.deduction_amount_cents)}</Text>
              {item.ai_justification && (
                <Text style={itemJustification}>{item.ai_justification}</Text>
              )}
            </Section>
          ))}
        </Section>
      ))}
    </>
  )
}

const box:              React.CSSProperties = { background: "#f4f4f5", borderRadius: 6, padding: "12px 16px", margin: "0 0 16px" }
const sectionHead:      React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "#71717a", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 8px" }
const itemRow:          React.CSSProperties = { borderBottom: "1px solid #e4e4e7", padding: "6px 0" }
const itemDesc:         React.CSSProperties = { fontSize: 13, color: "#3f3f46", margin: "0 0 2px", fontWeight: 600 }
const itemAmount:       React.CSSProperties = { fontSize: 13, color: "#ef4444", margin: "0 0 2px", fontWeight: 700 }
const itemJustification: React.CSSProperties = { fontSize: 12, color: "#71717a", margin: 0, fontStyle: "italic" }
