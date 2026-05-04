/**
 * lib/comms/templates/tenant/leases/lease-created.tsx — lease sent to tenant for signing (L1)
 *
 * Data:   tenant name, property label, rent, lease start date, optional signing link, org branding
 * Notes:  Fires when lease status → pending_signing (sendForSigning action). BUILD_63 Phase 5.
 */

import * as React from "react"
import { Section, Text, Button, Hr } from "@react-email/components"
import { EmailLayout, type OrgBranding } from "../../layout"

export interface LeaseCreatedEmailProps {
  branding: OrgBranding
  tenantName: string
  propertyLabel: string
  rentDisplay: string
  leaseStartDate: string
  signingUrl?: string
  senderName: string
}

export function LeaseCreatedEmail({
  branding,
  tenantName,
  propertyLabel,
  rentDisplay,
  leaseStartDate,
  signingUrl,
  senderName,
}: Readonly<LeaseCreatedEmailProps>) {
  const preview = `Your lease for ${propertyLabel} is ready to sign`

  return (
    <EmailLayout preview={preview} branding={branding}>
      <Text style={greet}>Dear {tenantName},</Text>

      <Text style={h1}>Your lease is ready to sign</Text>

      <Text style={para}>
        Your lease agreement for <strong>{propertyLabel}</strong> has been prepared and is
        ready for your signature. Please review and sign at your earliest convenience.
      </Text>

      <Section style={box}>
        <Text style={sectionHead}>Lease Summary</Text>
        <Text style={boxRow}><strong>Property:</strong> {propertyLabel}</Text>
        <Text style={boxRow}><strong>Commencement:</strong> {leaseStartDate}</Text>
        <Text style={boxRow}><strong>Monthly rent:</strong> {rentDisplay}</Text>
      </Section>

      {signingUrl && (
        <Section style={{ textAlign: "center" as const, margin: "24px 0" }}>
          <Button href={signingUrl} style={cta}>Review &amp; Sign Lease</Button>
        </Section>
      )}

      {!signingUrl && (
        <Text style={para}>
          Please contact {branding.orgEmail ?? senderName} to arrange signing of your lease agreement.
        </Text>
      )}

      <Hr style={{ borderColor: "#e4e4e7", margin: "24px 0" }} />
      <Text style={sign}>Kind regards,<br />{senderName}</Text>
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
