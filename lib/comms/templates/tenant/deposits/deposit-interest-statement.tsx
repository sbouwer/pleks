/**
 * lib/comms/templates/tenant/deposits/deposit-interest-statement.tsx — annual interest statement
 *
 * Data:   tenant name, interest accrued, cumulative total, property, period, org branding
 * Notes:  Transactional — single voice. NCA requirement. Fired annually on lease
 *         anniversary and at move-out (BUILD_63 Phase 3 — deposit-interest-statement cron).
 */

import * as React from "react"
import { Section, Text, Hr } from "@react-email/components"
import { EmailLayout, type OrgBranding } from "../../layout"

export interface DepositInterestStatementEmailProps {
  branding: OrgBranding
  tenantName: string
  propertyLabel: string
  periodFrom: string              // e.g. "1 June 2025"
  periodTo: string                // e.g. "31 May 2026"
  depositHeldDisplay: string      // original deposit
  interestThisPeriodDisplay: string
  cumulativeInterestDisplay: string
  effectiveRateDisplay: string    // e.g. "7.50%"
  senderName: string
}

export function DepositInterestStatementEmail({
  branding,
  tenantName,
  propertyLabel,
  periodFrom,
  periodTo,
  depositHeldDisplay,
  interestThisPeriodDisplay,
  cumulativeInterestDisplay,
  effectiveRateDisplay,
  senderName,
}: DepositInterestStatementEmailProps) {
  const preview = `Deposit interest statement — ${periodFrom} to ${periodTo} — ${propertyLabel}`

  return (
    <EmailLayout preview={preview} branding={branding}>
      <Text style={greet}>Dear {tenantName},</Text>

      <Text style={h1}>Annual Deposit Interest Statement</Text>

      <Text style={para}>
        Please find below your deposit interest statement for the period{" "}
        <strong>{periodFrom}</strong> to <strong>{periodTo}</strong> for the property at{" "}
        {propertyLabel}.
      </Text>

      <Section style={box}>
        <Text style={sectionHead}>Interest Statement — {periodFrom} to {periodTo}</Text>
        <Text style={boxRow}><strong>Property:</strong> {propertyLabel}</Text>
        <Text style={boxRow}><strong>Deposit held:</strong> {depositHeldDisplay}</Text>
        <Text style={boxRow}><strong>Interest rate (effective p.a.):</strong> {effectiveRateDisplay}</Text>
        <Hr style={{ borderColor: "#d4d4d8", margin: "8px 0" }} />
        <Text style={boxRow}><strong>Interest accrued this period:</strong> {interestThisPeriodDisplay}</Text>
        <Text style={boxRow}><strong>Cumulative interest to date:</strong> {cumulativeInterestDisplay}</Text>
      </Section>

      <Text style={para}>
        Your deposit and all accrued interest are held in our trust account and will be accounted
        for in full at the end of your tenancy. You are entitled to this interest in terms of the
        Rental Housing Act.
      </Text>

      <Text style={para}>
        If you have any questions about this statement, please contact us at{" "}
        {branding.orgEmail ?? senderName}.
      </Text>

      <Hr style={{ borderColor: "#e4e4e7", margin: "24px 0" }} />
      <Text style={small}>
        Interest is calculated at the prescribed rate determined by the South African Reserve Bank
        (SARB) repo rate plus a margin, or such rate as agreed in your lease agreement. This
        statement is issued in accordance with the Rental Housing Act 50 of 1999 and the National
        Credit Act 34 of 2005.
      </Text>
    </EmailLayout>
  )
}

const greet:       React.CSSProperties = { fontSize: 14, color: "#3f3f46", margin: "0 0 8px" }
const h1:          React.CSSProperties = { fontSize: 18, fontWeight: 700, color: "#18181b", margin: "0 0 16px" }
const para:        React.CSSProperties = { fontSize: 14, color: "#3f3f46", lineHeight: "1.6", margin: "0 0 16px" }
const box:         React.CSSProperties = { background: "#f4f4f5", borderRadius: 6, padding: "12px 16px", margin: "0 0 16px" }
const sectionHead: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "#71717a", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 8px" }
const boxRow:      React.CSSProperties = { fontSize: 13, color: "#3f3f46", margin: "2px 0" }
const small:       React.CSSProperties = { fontSize: 12, color: "#71717a", margin: 0 }
