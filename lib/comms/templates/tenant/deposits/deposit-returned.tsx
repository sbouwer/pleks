/**
 * lib/comms/templates/tenant/deposits/deposit-returned.tsx — deposit refund confirmation
 *
 * Data:   tenant name, refund amount, property, reference, org branding
 * Notes:  Mandatory legal template — RHA s5(3)(g). Fixed formal voice. Single variant.
 *         Fired when agent marks deposit as disbursed (status → refunded in disburse.ts).
 */

import * as React from "react"
import { Section, Text, Hr } from "@react-email/components"
import { EmailLayout, type OrgBranding } from "../../layout"

export interface DepositReturnedEmailProps {
  branding: OrgBranding
  tenantName: string
  propertyLabel: string
  refundAmountDisplay: string    // e.g. "R 8 460.00"
  referenceNumber: string        // payment reference
  disbursedDate: string          // e.g. "4 May 2026"
  bankDetails?: string           // masked, e.g. "***1234" if available
  senderName: string
}

export function DepositReturnedEmail({
  branding,
  tenantName,
  propertyLabel,
  refundAmountDisplay,
  referenceNumber,
  disbursedDate,
  bankDetails,
  senderName,
}: DepositReturnedEmailProps) {
  const preview = `Deposit refund processed — ${refundAmountDisplay} — ${propertyLabel}`

  return (
    <EmailLayout preview={preview} branding={branding}>
      <Text style={greet}>Dear {tenantName},</Text>

      <Text style={h1}>Deposit Refund Processed</Text>

      <Text style={para}>
        We confirm that your deposit refund has been processed and the funds have been
        transferred. Please allow 1–3 business days for the amount to reflect in your account.
      </Text>

      <Section style={box}>
        <Text style={boxRow}><strong>Property:</strong> {propertyLabel}</Text>
        <Text style={boxRow}><strong>Refund amount:</strong> {refundAmountDisplay}</Text>
        <Text style={boxRow}><strong>Payment reference:</strong> {referenceNumber}</Text>
        <Text style={boxRow}><strong>Date processed:</strong> {disbursedDate}</Text>
        {bankDetails && (
          <Text style={boxRow}><strong>Account:</strong> {bankDetails}</Text>
        )}
      </Section>

      <Text style={para}>
        This concludes the deposit return process for your tenancy at {propertyLabel}. The full
        itemised deduction schedule was previously communicated to you in the deposit return notice.
      </Text>

      <Text style={para}>
        If you did not receive the refund within 3 business days, or if you have any questions
        about the settlement, please contact us at {branding.orgEmail ?? senderName}.
      </Text>

      <Hr style={{ borderColor: "#e4e4e7", margin: "24px 0" }} />
      <Text style={small}>
        This notice is issued pursuant to section 5(3)(g) of the Rental Housing Act 50 of 1999.
        Reference: {referenceNumber}. Issued by: {branding.orgName}.
      </Text>
    </EmailLayout>
  )
}

const greet:  React.CSSProperties = { fontSize: 14, color: "#3f3f46", margin: "0 0 8px" }
const h1:     React.CSSProperties = { fontSize: 18, fontWeight: 700, color: "#18181b", margin: "0 0 16px" }
const para:   React.CSSProperties = { fontSize: 14, color: "#3f3f46", lineHeight: "1.6", margin: "0 0 16px" }
const box:    React.CSSProperties = { background: "#f4f4f5", borderRadius: 6, padding: "12px 16px", margin: "0 0 16px" }
const boxRow: React.CSSProperties = { fontSize: 13, color: "#3f3f46", margin: "2px 0" }
const small:  React.CSSProperties = { fontSize: 12, color: "#71717a", margin: 0 }
