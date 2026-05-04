/**
 * lib/comms/templates/tenant/deposits/deposit-pre-moveout.tsx — pre-move-out inspection reminder
 *
 * Data:   tenant name, lease end date, property, org branding
 * Notes:  Relational template — single professional variant (WhatsApp variants
 *         submitted separately for Meta approval). Fired T-15 days before lease end
 *         by the pre-moveout-inspection cron (BUILD_63 Phase 3).
 */

import * as React from "react"
import { Section, Text, Hr } from "@react-email/components"
import { EmailLayout, type OrgBranding } from "../../layout"

export interface DepositPreMoveoutEmailProps {
  branding: OrgBranding
  tenantName: string
  propertyLabel: string
  leaseEndDate: string     // e.g. "31 May 2026"
  daysRemaining: number
  senderName: string
}

export function DepositPreMoveoutEmail({
  branding,
  tenantName,
  propertyLabel,
  leaseEndDate,
  daysRemaining,
  senderName,
}: DepositPreMoveoutEmailProps) {
  const preview = `Move-out approaching — ${propertyLabel} — ${daysRemaining} days remaining`

  return (
    <EmailLayout preview={preview} branding={branding}>
      <Text style={greet}>Dear {tenantName},</Text>

      <Text style={h1}>Your lease is ending soon</Text>

      <Text style={para}>
        Your lease for <strong>{propertyLabel}</strong> ends on{" "}
        <strong>{leaseEndDate}</strong> — that is {daysRemaining} days from now.
      </Text>

      <Text style={para}>
        We would like to schedule a pre-move-out inspection at a time that suits you. This
        inspection gives you the opportunity to identify and address any items before the final
        move-out inspection, which helps ensure the best possible outcome for your deposit return.
      </Text>

      <Section style={box}>
        <Text style={sectionHead}>What to expect</Text>
        <Text style={boxRow}>• A walk-through with our agent before your move-out date</Text>
        <Text style={boxRow}>• Any fixable items identified so you can address them</Text>
        <Text style={boxRow}>• No deductions applied for items you repair before move-out</Text>
        <Text style={boxRow}>• Your deposit return processed within the statutory period</Text>
      </Section>

      <Text style={para}>
        Please reply to this email or contact {branding.orgEmail ?? senderName} to confirm a
        convenient time. We recommend scheduling the pre-move-out inspection at least 5 days
        before your final move-out date.
      </Text>

      <Hr style={{ borderColor: "#e4e4e7", margin: "24px 0" }} />
      <Text style={small}>
        The final move-out inspection will take place on or after {leaseEndDate}. Your deposit
        return schedule will be issued to you within the timeframe required by the Rental Housing
        Act after the final inspection is complete.
      </Text>
    </EmailLayout>
  )
}

// SMS fallback body (≤160 chars GSM-7)
export function buildPreMoveoutSms(
  tenantFirstName: string,
  propertyLabel: string,
  leaseEndDate: string,
  senderName: string,
): string {
  return `Hi ${tenantFirstName}, your lease at ${propertyLabel} ends ${leaseEndDate}. Contact us to schedule a pre-moveout inspection. — ${senderName}`
}

const greet:       React.CSSProperties = { fontSize: 14, color: "#3f3f46", margin: "0 0 8px" }
const h1:          React.CSSProperties = { fontSize: 18, fontWeight: 700, color: "#18181b", margin: "0 0 16px" }
const para:        React.CSSProperties = { fontSize: 14, color: "#3f3f46", lineHeight: "1.6", margin: "0 0 16px" }
const box:         React.CSSProperties = { background: "#f4f4f5", borderRadius: 6, padding: "12px 16px", margin: "0 0 16px" }
const sectionHead: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "#71717a", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 8px" }
const boxRow:      React.CSSProperties = { fontSize: 13, color: "#3f3f46", margin: "4px 0" }
const small:       React.CSSProperties = { fontSize: 12, color: "#71717a", margin: 0 }
