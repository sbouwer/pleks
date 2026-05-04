/**
 * lib/comms/templates/tenant/maintenance/maintenance-assigned.tsx — contractor assigned notification (M2)
 *
 * Data:   tenant name, property label, request title, contractor name, org branding
 * Notes:  Fires on contractor_id update on maintenance_request. BUILD_63 Phase 6.
 */

import * as React from "react"
import { Text, Hr } from "@react-email/components"
import { EmailLayout, type OrgBranding } from "../../layout"

export interface MaintenanceAssignedEmailProps {
  branding: OrgBranding
  tenantName: string
  propertyLabel: string
  requestTitle: string
  contractorName: string
  senderName: string
}

export function MaintenanceAssignedEmail({
  branding,
  tenantName,
  propertyLabel,
  requestTitle,
  contractorName,
  senderName,
}: Readonly<MaintenanceAssignedEmailProps>) {
  const preview = `A contractor has been assigned to your maintenance request at ${propertyLabel}`

  return (
    <EmailLayout preview={preview} branding={branding}>
      <Text style={greet}>Dear {tenantName},</Text>

      <Text style={h1}>Contractor assigned</Text>

      <Text style={para}>
        We have assigned a contractor to your maintenance request at <strong>{propertyLabel}</strong>.
        They will contact you to arrange access and confirm an appointment time.
      </Text>

      <Text style={box}>
        <strong>Request:</strong> {requestTitle}
        {"\n"}
        <strong>Contractor:</strong> {contractorName}
      </Text>

      <Text style={para}>
        If you have not heard from the contractor within 48 hours, please contact {senderName}.
      </Text>

      <Hr style={{ borderColor: "#e4e4e7", margin: "24px 0" }} />
      <Text style={sign}>Kind regards,<br />{senderName}</Text>
    </EmailLayout>
  )
}

const greet: React.CSSProperties = { fontSize: 14, color: "#3f3f46", margin: "0 0 8px" }
const h1:    React.CSSProperties = { fontSize: 20, fontWeight: 700, color: "#18181b", margin: "0 0 16px" }
const para:  React.CSSProperties = { fontSize: 14, color: "#3f3f46", lineHeight: "1.6", margin: "0 0 16px" }
const box:   React.CSSProperties = { background: "#f4f4f5", borderRadius: 6, padding: "12px 16px", margin: "0 0 16px", fontSize: 13, color: "#3f3f46", lineHeight: "2", whiteSpace: "pre-line" }
const sign:  React.CSSProperties = { fontSize: 14, color: "#3f3f46", margin: "0" }
