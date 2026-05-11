/**
 * lib/comms/templates/tenant/leases/lease-signed.tsx — lease fully signed confirmation (L3)
 *
 * Data:   tenant name, property label, org branding
 * Notes:  Fires when all parties have signed the lease. In the current manual flow this is
 *         simultaneous with L4 (activation); when DocuSeal is live, L3 fires from the webhook
 *         and L4 fires separately when the agent activates. BUILD_63 Phase 5.
 */

import * as React from "react"
import { Text, Hr } from "@react-email/components"
import { EmailLayout, type OrgBranding } from "../../layout"

export interface LeaseSignedEmailProps {
  branding: OrgBranding
  tenantName: string
  propertyLabel: string
  senderName: string
  signatureAttribution?: string
}

export function LeaseSignedEmail({
  branding,
  tenantName,
  propertyLabel,
  senderName,
  signatureAttribution,
}: Readonly<LeaseSignedEmailProps>) {
  const preview = `Your lease for ${propertyLabel} has been signed — confirmation enclosed`

  return (
    <EmailLayout preview={preview} branding={branding}>
      <Text style={greet}>Dear {tenantName},</Text>

      <Text style={h1}>Lease signed — all good</Text>

      <Text style={para}>
        Great news — your lease agreement for <strong>{propertyLabel}</strong> has been signed by
        all parties. We will be in touch shortly with your activation confirmation and move-in
        details.
      </Text>

      <Text style={para}>
        Please keep a copy of your signed lease for your records. If you have any questions in
        the meantime, contact {branding.orgEmail ?? senderName}.
      </Text>

      <Hr style={{ borderColor: "#e4e4e7", margin: "24px 0" }} />
      <Text style={sign}>Kind regards,<br />{senderName}</Text>
      {signatureAttribution && <Text style={attribution}>{signatureAttribution}</Text>}
    </EmailLayout>
  )
}

const greet:       React.CSSProperties = { fontSize: 14, color: "#3f3f46", margin: "0 0 8px" }
const h1:          React.CSSProperties = { fontSize: 20, fontWeight: 700, color: "#18181b", margin: "0 0 16px" }
const para:        React.CSSProperties = { fontSize: 14, color: "#3f3f46", lineHeight: "1.6", margin: "0 0 16px" }
const sign:        React.CSSProperties = { fontSize: 14, color: "#3f3f46", margin: "0" }
const attribution: React.CSSProperties = { fontSize: 10, color: "#94a3b8", fontStyle: "italic", margin: "4px 0 0", textAlign: "right" }
