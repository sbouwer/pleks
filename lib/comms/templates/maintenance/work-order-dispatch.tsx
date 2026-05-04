/**
 * lib/comms/templates/maintenance/work-order-dispatch.tsx — work order dispatch email to contractor
 *
 * Data:   contractor name/email, work order number, property details, WO portal URL
 * Notes:  Fired by updateMaintenanceStatus("work_order_sent"). Contractor accesses the WO
 *         via a token-protected public URL (/wo/[number]?token=[token]). Not tenant-facing.
 */

import * as React from "react"
import { Section, Text, Hr, Button } from "@react-email/components"
import { EmailLayout, type OrgBranding } from "../layout"

export interface WorkOrderDispatchEmailProps {
  branding: OrgBranding
  contractorName: string
  workOrderNumber: string
  propertyLabel: string
  unitLabel: string
  jobTitle: string
  urgency: string
  woUrl: string
  senderName: string
}

export function WorkOrderDispatchEmail({
  branding,
  contractorName,
  workOrderNumber,
  propertyLabel,
  unitLabel,
  jobTitle,
  urgency,
  woUrl,
  senderName,
}: Readonly<WorkOrderDispatchEmailProps>) {
  const preview = `Work order ${workOrderNumber} — ${jobTitle} — ${propertyLabel}`

  const urgencyLabel: Record<string, string> = {
    emergency: "EMERGENCY",
    urgent: "URGENT",
    routine: "Routine",
    cosmetic: "Cosmetic",
  }

  return (
    <EmailLayout preview={preview} branding={branding}>
      <Text style={greet}>Hi {contractorName},</Text>

      <Text style={h1}>Work Order: {workOrderNumber}</Text>

      <Text style={para}>
        You have been assigned the following maintenance job. Please review the details and
        confirm acceptance via the link below.
      </Text>

      <Section style={box}>
        <Text style={sectionHead}>Job Details</Text>
        <Text style={boxRow}><strong>Work order:</strong> {workOrderNumber}</Text>
        <Text style={boxRow}><strong>Job:</strong> {jobTitle}</Text>
        <Text style={boxRow}><strong>Property:</strong> {propertyLabel}</Text>
        <Text style={boxRow}><strong>Unit:</strong> {unitLabel}</Text>
        <Text style={boxRow}><strong>Priority:</strong> {urgencyLabel[urgency] ?? urgency}</Text>
      </Section>

      <Section style={{ textAlign: "center" as const, margin: "24px 0" }}>
        <Button href={woUrl} style={cta}>View Work Order</Button>
      </Section>

      <Text style={para}>
        The link above gives you access to the full job details, access instructions, and
        lets you submit your quote or update the job status as work progresses.
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
const cta:         React.CSSProperties = { background: "#18181b", color: "#ffffff", fontSize: 14, fontWeight: 600, padding: "12px 28px", borderRadius: 6, textDecoration: "none", display: "inline-block" }
const sign:        React.CSSProperties = { fontSize: 14, color: "#3f3f46", margin: "0" }
