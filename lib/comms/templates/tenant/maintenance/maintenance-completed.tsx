/**
 * lib/comms/templates/tenant/maintenance/maintenance-completed.tsx — work completed notification (M4)
 *
 * Data:   tenant name, property label, request title, org branding
 * Notes:  Fires on maintenance_request status='completed' via sign-off. BUILD_63 Phase 6.
 */

import * as React from "react"
import { Text, Hr } from "@react-email/components"
import { EmailLayout, type OrgBranding } from "../../layout"

export interface MaintenanceCompletedEmailProps {
  branding: OrgBranding
  tenantName: string
  propertyLabel: string
  requestTitle: string
  senderName: string
}

export function MaintenanceCompletedEmail({
  branding,
  tenantName,
  propertyLabel,
  requestTitle,
  senderName,
}: Readonly<MaintenanceCompletedEmailProps>) {
  const preview = `Maintenance work completed at ${propertyLabel}`

  return (
    <EmailLayout preview={preview} branding={branding}>
      <Text style={greet}>Dear {tenantName},</Text>

      <Text style={h1}>Maintenance work completed</Text>

      <Text style={para}>
        The maintenance work at <strong>{propertyLabel}</strong> has been completed and
        signed off.
      </Text>

      <Text style={box}>
        <strong>Request:</strong> {requestTitle}
      </Text>

      <Text style={para}>
        If you have any concerns about the work carried out or notice any follow-up issues,
        please contact {senderName}.
      </Text>

      <Hr style={{ borderColor: "#e4e4e7", margin: "24px 0" }} />
      <Text style={sign}>Kind regards,<br />{senderName}</Text>
    </EmailLayout>
  )
}

const greet: React.CSSProperties = { fontSize: 14, color: "#3f3f46", margin: "0 0 8px" }
const h1:    React.CSSProperties = { fontSize: 20, fontWeight: 700, color: "#18181b", margin: "0 0 16px" }
const para:  React.CSSProperties = { fontSize: 14, color: "#3f3f46", lineHeight: "1.6", margin: "0 0 16px" }
const box:   React.CSSProperties = { background: "#f4f4f5", borderRadius: 6, padding: "12px 16px", margin: "0 0 16px", fontSize: 13, color: "#3f3f46" }
const sign:  React.CSSProperties = { fontSize: 14, color: "#3f3f46", margin: "0" }
