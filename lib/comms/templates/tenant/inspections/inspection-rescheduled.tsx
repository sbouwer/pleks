/**
 * lib/comms/templates/tenant/inspections/inspection-rescheduled.tsx — inspection rescheduled notification
 *
 * Data:   tenant name, property label, inspection type, original date, new date, reason, org branding
 * Notes:  Relational tone. Fired from rescheduleInspection when tenant_id is set.
 *         BUILD_63 Phase 4 (I3).
 */

import * as React from "react"
import { Section, Text } from "@react-email/components"
import { EmailLayout, type OrgBranding } from "../../layout"

export interface InspectionRescheduledEmailProps {
  branding: OrgBranding
  tenantName: string
  propertyLabel: string
  inspectionTypeLabel: string
  originalDate: string
  newDate: string
  rescheduleReason?: string | null
  senderName: string
}

export function InspectionRescheduledEmail({
  branding,
  tenantName,
  propertyLabel,
  inspectionTypeLabel,
  originalDate,
  newDate,
  rescheduleReason,
  senderName,
}: Readonly<InspectionRescheduledEmailProps>) {
  const preview = `Inspection rescheduled — ${propertyLabel} — new date: ${newDate}`

  return (
    <EmailLayout preview={preview} branding={branding}>
      <Text style={greet}>Dear {tenantName},</Text>

      <Text style={h1}>{inspectionTypeLabel} Rescheduled</Text>

      <Text style={para}>
        We wish to advise you that your <strong>{inspectionTypeLabel}</strong> at{" "}
        <strong>{propertyLabel}</strong> has been rescheduled. Please note the updated date below.
      </Text>

      <Section style={box}>
        <Text style={sectionHead}>Updated Schedule</Text>
        <Text style={boxRow}><strong>Property:</strong> {propertyLabel}</Text>
        <Text style={boxRow}><strong>Type:</strong> {inspectionTypeLabel}</Text>
        <Text style={boxRow}><strong>Previous date:</strong> {originalDate}</Text>
        <Text style={boxRow}><strong>New date:</strong> {newDate}</Text>
        {rescheduleReason && (
          <Text style={boxRow}><strong>Reason:</strong> {rescheduleReason}</Text>
        )}
      </Section>

      <Text style={para}>
        Please ensure the property is accessible on the new scheduled date. If this date is
        inconvenient, please contact us as soon as possible.
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
