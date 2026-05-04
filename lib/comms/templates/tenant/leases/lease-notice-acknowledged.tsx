/**
 * lib/comms/templates/tenant/leases/lease-notice-acknowledged.tsx — notice to vacate acknowledgement (L10)
 *
 * Data:   tenant name, property label, notice date, vacate date, org branding
 * Notes:  Fires in giveNotice() when givenBy === "tenant". Evidentiary record of receipt.
 *         BUILD_63 Phase 5.
 */

import * as React from "react"
import { Section, Text, Hr } from "@react-email/components"
import { EmailLayout, type OrgBranding } from "../../layout"

export interface LeaseNoticeAcknowledgedEmailProps {
  branding: OrgBranding
  tenantName: string
  propertyLabel: string
  noticeDate: string
  vacateDate: string
  senderName: string
}

export function LeaseNoticeAcknowledgedEmail({
  branding,
  tenantName,
  propertyLabel,
  noticeDate,
  vacateDate,
  senderName,
}: Readonly<LeaseNoticeAcknowledgedEmailProps>) {
  const preview = `Your notice to vacate ${propertyLabel} has been received`

  return (
    <EmailLayout preview={preview} branding={branding}>
      <Text style={greet}>Dear {tenantName},</Text>

      <Text style={h1}>Notice to vacate received</Text>

      <Text style={para}>
        We confirm receipt of your notice to vacate <strong>{propertyLabel}</strong>. This
        letter serves as formal acknowledgement of your notice.
      </Text>

      <Section style={box}>
        <Text style={sectionHead}>Notice Details</Text>
        <Text style={boxRow}><strong>Property:</strong> {propertyLabel}</Text>
        <Text style={boxRow}><strong>Notice date:</strong> {noticeDate}</Text>
        <Text style={boxRow}><strong>Vacate date:</strong> {vacateDate}</Text>
      </Section>

      <Text style={para}>
        Please ensure the property is vacated and all keys returned by <strong>{vacateDate}</strong>.
        We will be in contact to arrange the final move-out inspection and deposit reconciliation.
      </Text>

      <Text style={para}>
        If you have any questions, please contact {branding.orgEmail ?? senderName}.
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
