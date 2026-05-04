/**
 * lib/comms/templates/tenant/deposits/deposit-received.tsx — deposit receipt confirmation email
 *
 * Data:   tenant name, property, deposit amount, org branding
 * Notes:  Transactional — single voice. Fired on lease activation when deposit_received
 *         transaction is inserted (BUILD_63 Phase 3).
 */

import * as React from "react"
import { Section, Text, Hr } from "@react-email/components"
import { EmailLayout, type OrgBranding } from "../../layout"

export interface DepositReceivedEmailProps {
  branding: OrgBranding
  tenantName: string
  propertyLabel: string       // e.g. "12 Oak St, Unit 3, Bellville"
  depositAmountDisplay: string // e.g. "R 9 000.00"
  leaseStartDate: string       // e.g. "1 June 2026"
  senderName: string
}

export function DepositReceivedEmail({
  branding,
  tenantName,
  propertyLabel,
  depositAmountDisplay,
  leaseStartDate,
  senderName,
}: DepositReceivedEmailProps) {
  const preview = `Deposit received — ${depositAmountDisplay} held in trust for ${propertyLabel}`

  return (
    <EmailLayout preview={preview} branding={branding}>
      <Text style={greet}>Dear {tenantName},</Text>

      <Text style={h1}>Deposit received — thank you</Text>

      <Text style={para}>
        We confirm that your security deposit of <strong>{depositAmountDisplay}</strong> has been
        received and is held in our trust account in accordance with the Rental Housing Act.
      </Text>

      <Section style={box}>
        <Text style={boxRow}><strong>Property:</strong> {propertyLabel}</Text>
        <Text style={boxRow}><strong>Deposit amount:</strong> {depositAmountDisplay}</Text>
        <Text style={boxRow}><strong>Lease commencement:</strong> {leaseStartDate}</Text>
        <Text style={boxRow}><strong>Held by:</strong> {senderName} (trust account)</Text>
      </Section>

      <Text style={para}>
        Your deposit earns interest at the prescribed rate for the duration of your tenancy. An annual
        interest statement will be issued to you each year, and a full interest accounting will be
        provided when your deposit is returned at the end of the lease.
      </Text>

      <Text style={para}>
        Please retain this confirmation for your records. If you have any questions, contact us at{" "}
        {branding.orgEmail ?? senderName}.
      </Text>

      <Hr style={{ borderColor: "#e4e4e7", margin: "24px 0" }} />
      <Text style={small}>
        This deposit is protected under the Rental Housing Act 50 of 1999. Any deductions at
        move-out will be itemised and communicated to you in writing before disbursement.
      </Text>
    </EmailLayout>
  )
}

const greet: React.CSSProperties = { fontSize: 14, color: "#3f3f46", margin: "0 0 8px" }
const h1:    React.CSSProperties = { fontSize: 18, fontWeight: 700, color: "#18181b", margin: "0 0 16px" }
const para:  React.CSSProperties = { fontSize: 14, color: "#3f3f46", lineHeight: "1.6", margin: "0 0 16px" }
const box:   React.CSSProperties = { background: "#f4f4f5", borderRadius: 6, padding: "12px 16px", margin: "0 0 16px" }
const boxRow: React.CSSProperties = { fontSize: 13, color: "#3f3f46", margin: "2px 0" }
const small:  React.CSSProperties = { fontSize: 12, color: "#71717a", margin: 0 }
