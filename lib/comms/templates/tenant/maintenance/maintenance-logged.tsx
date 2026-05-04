/**
 * lib/comms/templates/tenant/maintenance/maintenance-logged.tsx — maintenance request acknowledgement (M1)
 *
 * Data:   tenant name, property label, request title, work order number, org branding
 * Notes:  Fires on maintenance_request.insert when tenant_id is set. BUILD_63 Phase 6.
 */

import * as React from "react"
import { Text, Hr } from "@react-email/components"
import { EmailLayout, type OrgBranding } from "../../layout"

export interface MaintenanceLoggedEmailProps {
  branding: OrgBranding
  tenantName: string
  propertyLabel: string
  requestTitle: string
  workOrderNumber: string
  senderName: string
}

export function MaintenanceLoggedEmail({
  branding,
  tenantName,
  propertyLabel,
  requestTitle,
  workOrderNumber,
  senderName,
}: Readonly<MaintenanceLoggedEmailProps>) {
  const preview = `Maintenance request received — ref ${workOrderNumber}`

  return (
    <EmailLayout preview={preview} branding={branding}>
      <Text style={greet}>Dear {tenantName},</Text>

      <Text style={h1}>Maintenance request received</Text>

      <Text style={para}>
        We have received a maintenance request for <strong>{propertyLabel}</strong> and it is
        now under review. Our team will be in touch to arrange the next steps.
      </Text>

      <Text style={box}>
        <strong>Request:</strong> {requestTitle}
        {"\n"}
        <strong>Reference:</strong> {workOrderNumber}
      </Text>

      <Text style={para}>
        Please keep this reference number for your records. Quote it in any correspondence
        about this request.
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
