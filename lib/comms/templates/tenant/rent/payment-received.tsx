/**
 * lib/comms/templates/tenant/rent/payment-received.tsx — rent payment receipt email
 *
 * Data:   receipt details, property label, org branding
 * Notes:  Non-mandatory transactional — fired after payment allocation (BUILD_63 Phase 7 F2).
 */

import * as React from "react"
import { Section, Text, Hr } from "@react-email/components"
import { EmailLayout, type OrgBranding } from "../../layout"

export interface PaymentReceivedEmailProps {
  branding: OrgBranding
  tenantName: string
  propertyLabel: string
  receiptNumber: string
  paymentDate: string
  paymentMethod: string
  amountDisplay: string
  outstandingBalanceDisplay: string
  invoiceNumber: string
}

export function PaymentReceivedEmail({
  branding,
  tenantName,
  propertyLabel,
  receiptNumber,
  paymentDate,
  paymentMethod,
  amountDisplay,
  outstandingBalanceDisplay,
  invoiceNumber,
}: Readonly<PaymentReceivedEmailProps>) {
  const preview = `Payment confirmed — ${amountDisplay} received for ${propertyLabel}`
  const isCleared = outstandingBalanceDisplay === "R 0.00" || outstandingBalanceDisplay === "R0.00"

  return (
    <EmailLayout preview={preview} branding={branding}>
      <Text style={greet}>Dear {tenantName},</Text>
      <Text style={h1}>Payment Received</Text>
      <Text style={para}>
        Thank you — your payment for <strong>{propertyLabel}</strong> has been received and recorded.
      </Text>

      <Section style={box}>
        <Text style={sectionHead}>Receipt — {receiptNumber}</Text>
        <Text style={boxRow}><strong>Date:</strong> {paymentDate}</Text>
        <Text style={boxRow}><strong>Method:</strong> {paymentMethod}</Text>
        <Text style={boxRow}><strong>Invoice:</strong> {invoiceNumber}</Text>
        <Hr style={{ borderColor: "#d4d4d8", margin: "8px 0" }} />
        <Text style={amountRow}><strong>Amount received: {amountDisplay}</strong></Text>
        <Text style={boxRow}><strong>Outstanding balance: {outstandingBalanceDisplay}</strong></Text>
      </Section>

      {isCleared ? (
        <Text style={clearNote}>Your account is up to date. Thank you.</Text>
      ) : (
        <Text style={para}>
          A balance of <strong>{outstandingBalanceDisplay}</strong> remains on your account.
          Please arrange payment at your earliest convenience.
        </Text>
      )}

      <Hr style={{ borderColor: "#e4e4e7", margin: "24px 0" }} />
      <Text style={small}>
        This is an automated receipt. If you believe there is an error, please contact your managing
        agent directly.
      </Text>
    </EmailLayout>
  )
}

const greet:       React.CSSProperties = { fontSize: 14, color: "#3f3f46", margin: "0 0 8px" }
const h1:          React.CSSProperties = { fontSize: 18, fontWeight: 700, color: "#18181b", margin: "0 0 16px" }
const para:        React.CSSProperties = { fontSize: 14, color: "#3f3f46", lineHeight: "1.6", margin: "0 0 16px" }
const box:         React.CSSProperties = { background: "#f4f4f5", borderRadius: 6, padding: "12px 16px", margin: "0 0 16px" }
const sectionHead: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "#71717a", textTransform: "uppercase" as const, letterSpacing: "0.05em", margin: "0 0 8px" }
const boxRow:      React.CSSProperties = { fontSize: 13, color: "#3f3f46", margin: "2px 0" }
const amountRow:   React.CSSProperties = { fontSize: 14, color: "#16a34a", margin: "4px 0 2px" }
const clearNote:   React.CSSProperties = { fontSize: 14, color: "#16a34a", fontWeight: 600, margin: "0 0 16px" }
const small:       React.CSSProperties = { fontSize: 12, color: "#71717a", margin: 0 }
