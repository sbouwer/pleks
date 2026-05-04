/**
 * lib/comms/templates/tenant/leases/lease-terminated.tsx — lease expiry / termination notice (L11)
 *
 * Data:   tenant name, property label, lease end date, org branding
 * Notes:  Mandatory — cannot be unsubscribed. Fires when notice period ends and lease moves
 *         to expired status in lease-expiry-check cron. BUILD_63 Phase 5.
 */

import * as React from "react"
import { Section, Text, Hr } from "@react-email/components"
import { EmailLayout, type OrgBranding } from "../../layout"

export interface LeaseTerminatedEmailProps {
  branding: OrgBranding
  tenantName: string
  propertyLabel: string
  leaseEndDate: string
  senderName: string
}

export function LeaseTerminatedEmail({
  branding,
  tenantName,
  propertyLabel,
  leaseEndDate,
  senderName,
}: Readonly<LeaseTerminatedEmailProps>) {
  const preview = `Your tenancy at ${propertyLabel} has ended — important next steps`

  return (
    <EmailLayout preview={preview} branding={branding}>
      <Text style={greet}>Dear {tenantName},</Text>

      <Text style={h1}>Your tenancy has ended</Text>

      <Text style={para}>
        This letter confirms that your tenancy at <strong>{propertyLabel}</strong> has concluded
        as of <strong>{leaseEndDate}</strong> following the expiry of your notice period.
      </Text>

      <Section style={box}>
        <Text style={sectionHead}>Next Steps</Text>
        <Text style={boxRow}>• Return all keys and access devices to the agency</Text>
        <Text style={boxRow}>• Ensure the property is left in the condition required by your lease</Text>
        <Text style={boxRow}>• A final move-out inspection will be conducted to assess the property</Text>
        <Text style={boxRow}>• Your deposit reconciliation will follow in terms of the Rental Housing Act</Text>
      </Section>

      <Text style={para}>
        If you have already vacated, please contact {branding.orgEmail ?? senderName} to confirm
        key handover and arrange the final inspection at the earliest opportunity.
      </Text>

      <Hr style={{ borderColor: "#e4e4e7", margin: "24px 0" }} />
      <Text style={small}>
        Your deposit return schedule will be processed within the statutory period following the
        final move-out inspection. This notice is issued in accordance with the Rental Housing
        Act 50 of 1999.
      </Text>
    </EmailLayout>
  )
}

const greet: React.CSSProperties = { fontSize: 14, color: "#3f3f46", margin: "0 0 8px" }
const h1:    React.CSSProperties = { fontSize: 20, fontWeight: 700, color: "#18181b", margin: "0 0 16px" }
const para:  React.CSSProperties = { fontSize: 14, color: "#3f3f46", lineHeight: "1.6", margin: "0 0 16px" }
const box:   React.CSSProperties = { background: "#f4f4f5", borderRadius: 6, padding: "12px 16px", margin: "0 0 16px" }
const sectionHead: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "#71717a", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 8px" }
const boxRow: React.CSSProperties = { fontSize: 13, color: "#3f3f46", margin: "4px 0" }
const small:  React.CSSProperties = { fontSize: 12, color: "#71717a", margin: 0 }
