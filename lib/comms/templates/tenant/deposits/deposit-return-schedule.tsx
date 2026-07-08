/**
 * lib/comms/templates/tenant/deposits/deposit-return-schedule.tsx — itemised deduction schedule email
 *
 * Data:   tenant name, deposit figures, deduction items, deposit charges, deadline, org branding
 * Notes:  Mandatory legal template — RHA s5(7). Fixed formal voice. Single variant.
 *         Must be stored in body_full for Tribunal evidence trail.
 *         Fired when agent transitions deposit_reconciliations.status to sent_to_tenant.
 *         ADDENDUM_63B: chargeItems added alongside deductionItems for non-damage deductions.
 */

import * as React from "react"
import { Section, Text, Hr } from "@react-email/components"
import { EmailLayout, type OrgBranding } from "../../layout"
import { LegalFooter } from "../../LegalFooter"
import { DEPOSIT_RETURN_SCHEDULE_BASIS } from "../../legalCitations"
import { DepositDamageSection } from "./DepositDamageSection"
import { DepositChargesSection } from "./DepositChargesSection"

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

export interface DepositReturnScheduleEmailProps {
  branding: OrgBranding
  tenantName: string
  propertyLabel: string
  leaseStartDate: string
  leaseEndDate: string
  depositHeldDisplay: string
  interestAccruedDisplay: string
  totalAvailableDisplay: string
  totalDeductionsDisplay: string
  refundToTenantDisplay: string
  deductionItems: DeductionItem[]
  chargeItems: DepositChargeItem[]
  deadlineDate: string
  returnDays: number
  referenceNumber: string
}

// Canonical classifications from deposit_deduction_items.classification CHECK constraint.
// Exported for reuse in PDF renders and future tooling.
export const CLASSIFICATION_LABELS: Record<string, string> = {
  tenant_damage: "Deductions — Tenant Damage",
  wear_and_tear: "Deductions — Wear & Tear",
  pre_existing:  "Deductions — Pre-existing Condition",
  disputed:      "Deductions — Disputed",
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
  chargeItems,
  deadlineDate,
  returnDays,
  referenceNumber,
}: Readonly<DepositReturnScheduleEmailProps>) {
  const preview = `Deposit return schedule — ${propertyLabel} — Ref ${referenceNumber}`
  const hasAnyDeductions =
    deductionItems.some((i) => i.deduction_amount_cents > 0) ||
    chargeItems.some((c) => c.deduction_amount_cents > 0)

  return (
    <EmailLayout preview={preview} branding={branding}>
      <Text style={greet}>Dear {tenantName},</Text>

      <Text style={h1}>DEPOSIT RETURN SCHEDULE</Text>
      <Text style={refLine}>Ref: {referenceNumber} · Property: {propertyLabel}</Text>

      <Text style={para}>
        In accordance with section 5(7) of the Rental Housing Act 50 of 1999, please find below
        the itemised schedule of your deposit return. You have{" "}
        <strong>until {deadlineDate}</strong> to dispute any deductions listed herein.
      </Text>

      <Section style={box}>
        <Text style={sectionHead}>Lease Details</Text>
        <Text style={boxRow}><strong>Property:</strong> {propertyLabel}</Text>
        <Text style={boxRow}><strong>Lease commenced:</strong> {leaseStartDate}</Text>
        <Text style={boxRow}><strong>Lease ended:</strong> {leaseEndDate}</Text>
      </Section>

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

      {/* Inspection-derived damage deductions (grouped by classification) */}
      <DepositDamageSection deductionItems={deductionItems} />

      {/* Non-damage charges: arrears, utilities, penalties (grouped by charge_type) */}
      <DepositChargesSection chargeItems={chargeItems} />

      {!hasAnyDeductions && (
        <Text style={para}>
          No deductions have been applied. The full deposit plus accrued interest will be refunded
          to you.
        </Text>
      )}

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
        {returnDays} days of restoration of the property, subject to no valid dispute being received.
        If a dispute is lodged, the disputed portion will be held pending resolution in accordance
        with {DEPOSIT_RETURN_SCHEDULE_BASIS}.
      </Text>

      <LegalFooter issuedUnder={
        <>
          This notice is issued pursuant to section 5(7) of the Rental Housing Act 50 of 1999.
          Reference: {referenceNumber}. Landlord agent: {branding.orgName}.
          If you believe this schedule is incorrect, you may also refer the matter to the Rental
          Housing Tribunal in your province.
        </>
      } />
    </EmailLayout>
  )
}

const greet:       React.CSSProperties = { fontSize: 14, color: "#3f3f46", margin: "0 0 8px" }
const h1:          React.CSSProperties = { fontSize: 20, fontWeight: 700, color: "#18181b", margin: "0 0 4px" }
const refLine:     React.CSSProperties = { fontSize: 12, color: "#71717a", margin: "0 0 20px" }
const para:        React.CSSProperties = { fontSize: 14, color: "#3f3f46", lineHeight: "1.6", margin: "0 0 16px" }
const box:         React.CSSProperties = { background: "#f4f4f5", borderRadius: 6, padding: "12px 16px", margin: "0 0 16px" }
const sectionHead: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "#71717a", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 8px" }
const boxRow:      React.CSSProperties = { fontSize: 13, color: "#3f3f46", margin: "2px 0" }
