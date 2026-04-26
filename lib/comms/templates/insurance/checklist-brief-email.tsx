/**
 * insurance.checklist_brief — email body sent to the broker when the agent
 * sends the insurance coverage verification brief. The broker brief itself
 * is attached as an HTML file.
 */

import * as React from "react"
import { Text } from "@react-email/components"
import { EmailLayout, type OrgBranding } from "../layout"

export interface ChecklistBriefEmailProps {
  branding: OrgBranding
  brokerName: string
  propertyName: string
  agentName: string
  agentEmail: string | null
  agentPhone: string | null
}

export function ChecklistBriefEmail({
  branding,
  brokerName,
  propertyName,
  agentName,
  agentEmail,
  agentPhone,
}: Readonly<ChecklistBriefEmailProps>) {
  const preview = `Insurance coverage verification request for ${propertyName}`

  return (
    <EmailLayout preview={preview} branding={branding}>
      <Text style={para}>Dear {brokerName},</Text>

      <Text style={para}>
        Please find attached an insurance coverage verification request for{" "}
        <strong>{propertyName}</strong>.
      </Text>

      <Text style={para}>
        The attached file lists the items we need confirmed. Please review
        and reply to this email confirming each item. A copy of the current
        policy schedule would be appreciated.
      </Text>

      <Text style={para}>
        Thank you for your assistance.
      </Text>

      <Text style={signoff}>
        {agentName}
        <br />
        {branding.orgName}
        {agentPhone ? <><br />{agentPhone}</> : null}
        {agentEmail ? <><br />{agentEmail}</> : null}
      </Text>
    </EmailLayout>
  )
}

const para    = { fontSize: "15px", lineHeight: "1.6", color: "#18181b", margin: "0 0 14px" }
const signoff = { fontSize: "15px", lineHeight: "1.8", color: "#18181b", margin: "20px 0 0" }
