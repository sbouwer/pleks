/**
 * lib/comms/templates/tenant/maintenance/maintenance-emergency.tsx — critical/emergency maintenance alert (M5)
 *
 * Data:   tenant name, property label, request title, urgency reason, contact details, org branding
 * Notes:  Mandatory (habitability duty). Fires on AI triage severity=critical or manual escalation.
 *         Router attempts email first, then SMS fallback (allowed_channels: ["email","sms","whatsapp"]).
 *         BUILD_63 Phase 6.
 */

import * as React from "react"
import { Section, Text, Hr } from "@react-email/components"
import { EmailLayout, type OrgBranding } from "../../layout"

export interface MaintenanceEmergencyEmailProps {
  branding: OrgBranding
  tenantName: string
  propertyLabel: string
  requestTitle: string
  urgencyReason?: string
  contactName?: string
  contactPhone?: string
  senderName: string
}

export function MaintenanceEmergencyEmail({
  branding,
  tenantName,
  propertyLabel,
  requestTitle,
  urgencyReason,
  contactName,
  contactPhone,
  senderName,
}: Readonly<MaintenanceEmergencyEmailProps>) {
  const preview = `URGENT: Critical maintenance issue at ${propertyLabel} — immediate attention required`

  return (
    <EmailLayout preview={preview} branding={branding}>
      <Text style={greet}>Dear {tenantName},</Text>

      <Text style={h1}>Urgent: critical maintenance issue</Text>

      <Text style={para}>
        A critical maintenance issue has been identified at <strong>{propertyLabel}</strong>
        that requires immediate attention. Our team is actively working to resolve this.
      </Text>

      <Section style={alertBox}>
        <Text style={alertHead}>Issue details</Text>
        <Text style={boxRow}><strong>Request:</strong> {requestTitle}</Text>
        {urgencyReason && (
          <Text style={boxRow}><strong>Reason:</strong> {urgencyReason}</Text>
        )}
      </Section>

      {(contactName ?? contactPhone) && (
        <Text style={para}>
          If you have any safety concerns or need to vacate the affected area, please contact{" "}
          {contactName ?? senderName}
          {contactPhone ? ` on ${contactPhone}` : ""} immediately.
        </Text>
      )}

      {!(contactName ?? contactPhone) && (
        <Text style={para}>
          If you have any safety concerns, please contact {senderName} immediately. Do not
          use any affected areas until further notice.
        </Text>
      )}

      <Hr style={{ borderColor: "#e4e4e7", margin: "24px 0" }} />
      <Text style={sign}>Kind regards,<br />{senderName}</Text>
    </EmailLayout>
  )
}

const greet:     React.CSSProperties = { fontSize: 14, color: "#3f3f46", margin: "0 0 8px" }
const h1:        React.CSSProperties = { fontSize: 20, fontWeight: 700, color: "#dc2626", margin: "0 0 16px" }
const para:      React.CSSProperties = { fontSize: 14, color: "#3f3f46", lineHeight: "1.6", margin: "0 0 16px" }
const alertBox:  React.CSSProperties = { background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 6, padding: "12px 16px", margin: "0 0 16px" }
const alertHead: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "#dc2626", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 8px" }
const boxRow:    React.CSSProperties = { fontSize: 13, color: "#3f3f46", margin: "4px 0" }
const sign:      React.CSSProperties = { fontSize: 14, color: "#3f3f46", margin: "0" }
