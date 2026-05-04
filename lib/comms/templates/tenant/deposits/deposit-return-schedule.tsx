/**
 * lib/comms/templates/tenant/deposits/deposit-return-schedule.tsx — itemised deduction schedule
 *
 * Data:   tenant name, deposit figures, deduction items, deadline, org branding
 * Notes:  Mandatory legal template — RHA s5(7). Fixed formal voice. Single variant.
 *         Must be stored in body_full for Tribunal evidence trail.
 *         Fired when agent transitions deposit_reconciliations.status to sent_to_tenant.
 */

import * as React from "react"
import { Section, Text, Hr } from "@react-email/components"
import { EmailLayout, type OrgBranding } from "../../layout"

export interface DeductionItem {
  room: string | null
  item_description: string
  deduction_amount_cents: number
  classification: string
  ai_justification: string | null
}

export interface DepositReturnScheduleEmailProps {
  branding: OrgBranding
  tenantName: string
  propertyLabel: string
  leaseStartDate: string
  leaseEndDate: string
  depositHeldDisplay: string       // e.g. "R 9 000.00"
  interestAccruedDisplay: string   // e.g. "R 540.00"
  totalAvailableDisplay: string    // total held + interest
  totalDeductionsDisplay: string
  refundToTenantDisplay: string
  deductionItems: DeductionItem[]
  deadlineDate: string             // e.g. "21 June 2026"
  returnDays: number               // statutory return period (usually 14 or 21)
  referenceNumber: string          // first 8 chars of reconciliation id
}

function formatCents(cents: number): string {
  return "R " + (cents / 100).toLocaleString("en-ZA", { minimumFractionDigits: 2 })
}

export function DepositReturnScheduleEmail({
  branding,
  tenantName,
  propertyLabel,
  leaseStartDate,
  leaseEndDate,
  depositHeldDisplay,
  interestAccruedDisplay,
  totalAvailableDisplay,
  totalDeductionsDisplay,
  refundToTenantDisplay,
  deductionItems,
  deadlineDate,
  returnDays,
  referenceNumber,
}: DepositReturnScheduleEmailProps) {
  const preview = `Deposit return schedule — ${propertyLabel} — Ref ${referenceNumber}`

  const tenantDamageItems = deductionItems.filter(
    (i) => i.classification === "tenant_damage" && i.deduction_amount_cents > 0
  )

  return (
    <EmailLayout preview={preview} branding={branding}>
      <Text style={greet}>Dear {tenantName},</Text>

      <Text style={h1}>DEPOSIT RETURN SCHEDULE</Text>
      <Text style={refLine}>Ref: {referenceNumber} · Property: {propertyLabel}</Text>

      <Text style={para}>
        In accordance with section 5(7) of the Rental Housing Act 50 of 1999, please find below
        the itemised schedule of your deposit return. You have <strong>{returnDays} days</strong>{" "}
        from the date of vacation to dispute any deductions listed herein.
      </Text>

      {/* Lease summary */}
      <Section style={box}>
        <Text style={sectionHead}>Lease Details</Text>
        <Text style={boxRow}><strong>Property:</strong> {propertyLabel}</Text>
        <Text style={boxRow}><strong>Lease commenced:</strong> {leaseStartDate}</Text>
        <Text style={boxRow}><strong>Lease ended:</strong> {leaseEndDate}</Text>
      </Section>

      {/* Financial summary */}
      <Section style={box}>
        <Text style={sectionHead}>Deposit Summary</Text>
        <Text style={boxRow}><strong>Deposit held:</strong> {depositHeldDisplay}</Text>
        <Text style={boxRow}><strong>Interest accrued:</strong> {interestAccruedDisplay}</Text>
        <Text style={boxRow}><strong>Total available:</strong> {totalAvailableDisplay}</Text>
        <Text style={boxRow}><strong>Total deductions:</strong> {totalDeductionsDisplay}</Text>
        <Hr style={{ borderColor: "#d4d4d8", margin: "8px 0" }} />
        <Text style={{ ...boxRow, fontWeight: 700, fontSize: 14 }}>
          Refund to tenant: {refundToTenantDisplay}
        </Text>
      </Section>

      {/* Deduction items */}
      {tenantDamageItems.length > 0 && (
        <Section style={box}>
          <Text style={sectionHead}>Deductions — Tenant Damage</Text>
          {tenantDamageItems.map((item, i) => (
            <Section key={i} style={itemRow}>
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
      )}

      {tenantDamageItems.length === 0 && (
        <Text style={para}>
          No deductions have been applied. The full deposit plus accrued interest will be refunded
          to you.
        </Text>
      )}

      {/* Dispute window */}
      <Section style={{ ...box, borderLeft: "3px solid #ef4444" }}>
        <Text style={sectionHead}>Your Right to Dispute — {returnDays}-Day Window</Text>
        <Text style={boxRow}>
          If you dispute any deduction, you must notify us in writing <strong>before {deadlineDate}</strong>.
          Disputes received after this date may not be considered. To dispute, reply to this email
          with your specific objections and supporting documentation (photos, quotes, prior condition
          reports).
        </Text>
      </Section>

      <Text style={para}>
        The refund of <strong>{refundToTenantDisplay}</strong> will be processed within{" "}
        {returnDays} days of the date of this notice, subject to no valid dispute being received.
        If a dispute is lodged, the disputed portion will be held pending resolution in accordance
        with RHA s5(9).
      </Text>

      <Hr style={{ borderColor: "#e4e4e7", margin: "24px 0" }} />
      <Text style={small}>
        This notice is issued pursuant to section 5(7) of the Rental Housing Act 50 of 1999.
        Reference: {referenceNumber}. Landlord agent: {branding.orgName}.
        If you believe this schedule is incorrect, you may also refer the matter to the Rental
        Housing Tribunal in your province.
      </Text>
    </EmailLayout>
  )
}

const greet:           React.CSSProperties = { fontSize: 14, color: "#3f3f46", margin: "0 0 8px" }
const h1:              React.CSSProperties = { fontSize: 20, fontWeight: 700, color: "#18181b", margin: "0 0 4px" }
const refLine:         React.CSSProperties = { fontSize: 12, color: "#71717a", margin: "0 0 20px" }
const para:            React.CSSProperties = { fontSize: 14, color: "#3f3f46", lineHeight: "1.6", margin: "0 0 16px" }
const box:             React.CSSProperties = { background: "#f4f4f5", borderRadius: 6, padding: "12px 16px", margin: "0 0 16px" }
const sectionHead:     React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "#71717a", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 8px" }
const boxRow:          React.CSSProperties = { fontSize: 13, color: "#3f3f46", margin: "2px 0" }
const itemRow:         React.CSSProperties = { borderBottom: "1px solid #e4e4e7", padding: "6px 0" }
const itemDesc:        React.CSSProperties = { fontSize: 13, color: "#3f3f46", margin: "0 0 2px", fontWeight: 600 }
const itemAmount:      React.CSSProperties = { fontSize: 13, color: "#ef4444", margin: "0 0 2px", fontWeight: 700 }
const itemJustification: React.CSSProperties = { fontSize: 12, color: "#71717a", margin: 0, fontStyle: "italic" }
const small:           React.CSSProperties = { fontSize: 12, color: "#71717a", margin: 0 }
