/**
 * lib/comms/templates/tenant/leases/lease-escalation-notice.tsx — annual rent escalation notice (L7)
 *
 * Data:   tenant name, property label, current rent, new rent, effective date, org branding
 * Notes:  Fires T-30 before escalation_date by lease-lifecycle cron. BUILD_63 Phase 5.
 */

import * as React from "react"
import { Section, Text, Hr } from "@react-email/components"
import { EmailLayout, type OrgBranding } from "../../layout"

export interface LeaseEscalationNoticeEmailProps {
  branding: OrgBranding
  tenantName: string
  propertyLabel: string
  currentRentDisplay: string
  newRentDisplay: string
  escalationPercent?: number
  effectiveDate: string
  senderName: string
}

export function LeaseEscalationNoticeEmail({
  branding,
  tenantName,
  propertyLabel,
  currentRentDisplay,
  newRentDisplay,
  escalationPercent,
  effectiveDate,
  senderName,
}: Readonly<LeaseEscalationNoticeEmailProps>) {
  const preview = `Your rent at ${propertyLabel} will change from ${effectiveDate}`

  return (
    <EmailLayout preview={preview} branding={branding}>
      <Text style={greet}>Dear {tenantName},</Text>

      <Text style={h1}>Upcoming rent escalation</Text>

      <Text style={para}>
        This letter serves as advance notice that the monthly rental for{" "}
        <strong>{propertyLabel}</strong> will be adjusted in accordance with your lease agreement.
      </Text>

      <Section style={box}>
        <Text style={sectionHead}>Escalation Details</Text>
        <Text style={boxRow}><strong>Current monthly rent:</strong> {currentRentDisplay}</Text>
        <Text style={boxRow}><strong>New monthly rent:</strong> {newRentDisplay}</Text>
        {escalationPercent != null && (
          <Text style={boxRow}><strong>Increase:</strong> {escalationPercent}%</Text>
        )}
        <Text style={boxRow}><strong>Effective from:</strong> {effectiveDate}</Text>
      </Section>

      <Text style={para}>
        Your invoice from {effectiveDate} onwards will reflect the new rental amount. If you have
        any questions regarding this adjustment, please do not hesitate to contact{" "}
        {branding.orgEmail ?? senderName}.
      </Text>

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
const sign:        React.CSSProperties = { fontSize: 14, color: "#3f3f46", margin: "0" }
