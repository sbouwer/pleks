/**
 * lib/comms/templates/tenant/inspections/inspection-scheduled.tsx — inspection scheduled notification
 *
 * Data:   tenant name, property label, inspection type, scheduled date, sender name, org branding
 * Notes:  Relational tone. Fired from createInspection when tenant_id and scheduled_date are set.
 *         BUILD_63 Phase 4 (I1).
 */

import * as React from "react"
import { Section, Text } from "@react-email/components"
import { EmailLayout, type OrgBranding } from "../../layout"

export interface InspectionScheduledEmailProps {
  branding: OrgBranding
  tenantName: string
  propertyLabel: string
  inspectionTypeLabel: string
  scheduledDate: string
  senderName: string
}

export function InspectionScheduledEmail({
  branding,
  tenantName,
  propertyLabel,
  inspectionTypeLabel,
  scheduledDate,
  senderName,
}: Readonly<InspectionScheduledEmailProps>) {
  const preview = `Inspection scheduled — ${propertyLabel} — ${scheduledDate}`

  return (
    <EmailLayout preview={preview} branding={branding}>
      <Text style={greet}>Dear {tenantName},</Text>

      <Text style={h1}>{inspectionTypeLabel} Scheduled</Text>

      <Text style={para}>
        We wish to advise you that a <strong>{inspectionTypeLabel}</strong> has been scheduled at
        your property. Please find the details below.
      </Text>

      <Section style={box}>
        <Text style={sectionHead}>Inspection Details</Text>
        <Text style={boxRow}><strong>Property:</strong> {propertyLabel}</Text>
        <Text style={boxRow}><strong>Type:</strong> {inspectionTypeLabel}</Text>
        <Text style={boxRow}><strong>Scheduled for:</strong> {scheduledDate}</Text>
      </Section>

      <Text style={para}>
        Please ensure the property is accessible on the scheduled date. If this date is
        inconvenient, please contact us as soon as possible so we can make alternative arrangements.
      </Text>

      <Text style={para}>
        Should you have any questions, please reply to this email or contact your property manager
        directly.
      </Text>

      <Text style={sign}>Kind regards,<br />{senderName}</Text>
    </EmailLayout>
  )
}

const greet:       React.CSSProperties = { fontSize: 14, color: "#3f3f46", margin: "0 0 8px" }
const h1:          React.CSSProperties = { fontSize: 20, fontWeight: 700, color: "#18181b", margin: "0 0 16px" }
const para:        React.CSSProperties = { fontSize: 14, color: "#3f3f46", lineHeight: "1.6", margin: "0 0 16px" }
const box:         React.CSSProperties = { background: "#f4f4f5", borderRadius: 6, padding: "12px 16px", margin: "0 0 16px" }
const sectionHead: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "#71717a", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 8px" }
const boxRow:      React.CSSProperties = { fontSize: 13, color: "#3f3f46", margin: "2px 0" }
const sign:        React.CSSProperties = { fontSize: 14, color: "#3f3f46", margin: "24px 0 0" }
