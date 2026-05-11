/**
 * lib/comms/templates/tenant/leases/lease-activated.tsx — lease activation confirmation (L4)
 *
 * Data:   tenant name, property label, rent, lease start/end dates, portal URL, org branding
 * Notes:  Fires as a step in activateLeaseCascade. Combines L3+L4 since Pleks has no separate
 *         "signed" status (pending_signing → active in one step). BUILD_63 Phase 5.
 */

import * as React from "react"
import { Section, Text, Button, Hr } from "@react-email/components"
import { EmailLayout, type OrgBranding } from "../../layout"

export interface LeaseActivatedEmailProps {
  branding: OrgBranding
  tenantName: string
  propertyLabel: string
  rentDisplay: string
  leaseStartDate: string
  leaseEndDate?: string
  isFixedTerm: boolean
  portalUrl?: string
  senderName: string
  signatureAttribution?: string
}

export function LeaseActivatedEmail({
  branding,
  tenantName,
  propertyLabel,
  rentDisplay,
  leaseStartDate,
  leaseEndDate,
  isFixedTerm,
  portalUrl,
  senderName,
  signatureAttribution,
}: Readonly<LeaseActivatedEmailProps>) {
  const preview = `Your lease at ${propertyLabel} is now active — welcome!`

  return (
    <EmailLayout preview={preview} branding={branding}>
      <Text style={greet}>Dear {tenantName},</Text>

      <Text style={h1}>Your lease is now active</Text>

      <Text style={para}>
        Welcome to <strong>{propertyLabel}</strong>! Your lease agreement has been signed and is
        now active. We are pleased to have you as a tenant and look forward to a great tenancy.
      </Text>

      <Section style={box}>
        <Text style={sectionHead}>Your Lease Details</Text>
        <Text style={boxRow}><strong>Property:</strong> {propertyLabel}</Text>
        <Text style={boxRow}><strong>Commencement:</strong> {leaseStartDate}</Text>
        {isFixedTerm && leaseEndDate && (
          <Text style={boxRow}><strong>End date:</strong> {leaseEndDate}</Text>
        )}
        {!isFixedTerm && (
          <Text style={boxRow}><strong>Term:</strong> Month-to-month</Text>
        )}
        <Text style={boxRow}><strong>Monthly rent:</strong> {rentDisplay}</Text>
      </Section>

      {portalUrl && (
        <>
          <Text style={para}>
            You can access your tenant portal to view your lease, submit maintenance requests,
            and stay up to date with your account.
          </Text>
          <Section style={{ textAlign: "center" as const, margin: "24px 0" }}>
            <Button href={portalUrl} style={cta}>Access Tenant Portal</Button>
          </Section>
        </>
      )}

      <Hr style={{ borderColor: "#e4e4e7", margin: "24px 0" }} />
      <Text style={sign}>Kind regards,<br />{senderName}</Text>
      {signatureAttribution && <Text style={attribution}>{signatureAttribution}</Text>}
    </EmailLayout>
  )
}

const greet:       React.CSSProperties = { fontSize: 14, color: "#3f3f46", margin: "0 0 8px" }
const h1:          React.CSSProperties = { fontSize: 20, fontWeight: 700, color: "#18181b", margin: "0 0 16px" }
const para:        React.CSSProperties = { fontSize: 14, color: "#3f3f46", lineHeight: "1.6", margin: "0 0 16px" }
const box:         React.CSSProperties = { background: "#f4f4f5", borderRadius: 6, padding: "12px 16px", margin: "0 0 16px" }
const sectionHead: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "#71717a", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 8px" }
const boxRow:      React.CSSProperties = { fontSize: 13, color: "#3f3f46", margin: "4px 0" }
const cta:         React.CSSProperties = { background: "#18181b", color: "#ffffff", fontSize: 14, fontWeight: 600, padding: "12px 28px", borderRadius: 6, textDecoration: "none", display: "inline-block" }
const sign:        React.CSSProperties = { fontSize: 14, color: "#3f3f46", margin: "0" }
const attribution: React.CSSProperties = { fontSize: 10, color: "#94a3b8", fontStyle: "italic", margin: "4px 0 0", textAlign: "right" }
