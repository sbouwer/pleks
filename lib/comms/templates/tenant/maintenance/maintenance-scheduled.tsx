/**
 * lib/comms/templates/tenant/maintenance/maintenance-scheduled.tsx — appointment scheduled notification (M3)
 *
 * Data:   tenant name, property label, request title, date/time, optional contractor name, org branding
 * Notes:  Fires when scheduled_date is set on maintenance_request. BUILD_63 Phase 6.
 */

import * as React from "react"
import { Section, Text, Hr } from "@react-email/components"
import { EmailLayout, type OrgBranding } from "../../layout"

export interface MaintenanceScheduledEmailProps {
  branding: OrgBranding
  tenantName: string
  propertyLabel: string
  requestTitle: string
  scheduledDate: string
  scheduledTimeFrom?: string
  scheduledTimeTo?: string
  contractorName?: string
  senderName: string
}

export function MaintenanceScheduledEmail({
  branding,
  tenantName,
  propertyLabel,
  requestTitle,
  scheduledDate,
  scheduledTimeFrom,
  scheduledTimeTo,
  contractorName,
  senderName,
}: Readonly<MaintenanceScheduledEmailProps>) {
  let timeRange: string | null = null
  if (scheduledTimeFrom) {
    timeRange = scheduledTimeTo ? `${scheduledTimeFrom} – ${scheduledTimeTo}` : scheduledTimeFrom
  }

  const preview = `Maintenance appointment confirmed for ${scheduledDate} at ${propertyLabel}`

  return (
    <EmailLayout preview={preview} branding={branding}>
      <Text style={greet}>Dear {tenantName},</Text>

      <Text style={h1}>Maintenance appointment confirmed</Text>

      <Text style={para}>
        Your maintenance appointment at <strong>{propertyLabel}</strong> has been scheduled.
        Please ensure access to the property at the confirmed time.
      </Text>

      <Section style={box}>
        <Text style={boxRow}><strong>Request:</strong> {requestTitle}</Text>
        <Text style={boxRow}><strong>Date:</strong> {scheduledDate}</Text>
        {timeRange && (
          <Text style={boxRow}><strong>Time:</strong> {timeRange}</Text>
        )}
        {contractorName && (
          <Text style={boxRow}><strong>Contractor:</strong> {contractorName}</Text>
        )}
      </Section>

      <Text style={para}>
        If you need to reschedule or cannot provide access, please contact {senderName} as
        soon as possible to avoid a callout fee.
      </Text>

      <Hr style={{ borderColor: "#e4e4e7", margin: "24px 0" }} />
      <Text style={sign}>Kind regards,<br />{senderName}</Text>
    </EmailLayout>
  )
}

const greet:  React.CSSProperties = { fontSize: 14, color: "#3f3f46", margin: "0 0 8px" }
const h1:     React.CSSProperties = { fontSize: 20, fontWeight: 700, color: "#18181b", margin: "0 0 16px" }
const para:   React.CSSProperties = { fontSize: 14, color: "#3f3f46", lineHeight: "1.6", margin: "0 0 16px" }
const box:    React.CSSProperties = { background: "#f4f4f5", borderRadius: 6, padding: "12px 16px", margin: "0 0 16px" }
const boxRow: React.CSSProperties = { fontSize: 13, color: "#3f3f46", margin: "4px 0" }
const sign:   React.CSSProperties = { fontSize: 14, color: "#3f3f46", margin: "0" }
