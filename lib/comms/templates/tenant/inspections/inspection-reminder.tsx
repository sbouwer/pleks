/**
 * lib/comms/templates/tenant/inspections/inspection-reminder.tsx — 24h inspection reminder
 *
 * Data:   tenant name, property label, inspection type, scheduled date, sender name, org branding
 * Notes:  Relational tone. Fired by daily cron when scheduled_date = tomorrow and status = scheduled.
 *         buildInspectionReminderSms() exported for cron SMS fallback. BUILD_63 Phase 4 (I2).
 */

import * as React from "react"
import { Section, Text } from "@react-email/components"
import { EmailLayout, type OrgBranding } from "../../layout"

export interface InspectionReminderEmailProps {
  branding: OrgBranding
  tenantName: string
  propertyLabel: string
  inspectionTypeLabel: string
  scheduledDate: string
  senderName: string
}

export function buildInspectionReminderSms(
  firstName: string,
  inspectionTypeLabel: string,
  propertyLabel: string,
  scheduledDate: string,
  senderName: string,
): string {
  return `${senderName}: Reminder — your ${inspectionTypeLabel} at ${propertyLabel} is scheduled for tomorrow, ${scheduledDate}. Please ensure the property is accessible.`
}

export function InspectionReminderEmail({
  branding,
  tenantName,
  propertyLabel,
  inspectionTypeLabel,
  scheduledDate,
  senderName,
}: Readonly<InspectionReminderEmailProps>) {
  const preview = `Reminder: ${inspectionTypeLabel} tomorrow — ${propertyLabel}`

  return (
    <EmailLayout preview={preview} branding={branding}>
      <Text style={greet}>Dear {tenantName},</Text>

      <Text style={h1}>Inspection Reminder — Tomorrow</Text>

      <Text style={para}>
        This is a friendly reminder that your <strong>{inspectionTypeLabel}</strong> at{" "}
        <strong>{propertyLabel}</strong> is scheduled for tomorrow, <strong>{scheduledDate}</strong>.
      </Text>

      <Section style={box}>
        <Text style={sectionHead}>Inspection Details</Text>
        <Text style={boxRow}><strong>Property:</strong> {propertyLabel}</Text>
        <Text style={boxRow}><strong>Type:</strong> {inspectionTypeLabel}</Text>
        <Text style={boxRow}><strong>Date:</strong> {scheduledDate}</Text>
      </Section>

      <Text style={para}>
        Please ensure the property is accessible at the time of the inspection. If you have any
        concerns or need to reschedule, please contact us immediately.
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
