/**
 * lib/comms/templates/maintenance/memo-landlord-notified.tsx — landlord copy of an agent memo
 *
 * Data:   landlord name, property label, WO number, agent name, memo text, request title
 * Notes:  Fired by addMaintenanceNote when notifyLandlord=true. Truncated to 500 chars in email.
 *         Transactional, email-only. Agent explicitly opted in per memo (default off).
 */

import * as React from "react"
import { Section, Text } from "@react-email/components"
import { EmailLayout, type OrgBranding } from "../layout"

export interface MemoLandlordNotifiedEmailProps {
  branding: OrgBranding
  landlordName: string
  propertyLabel: string
  workOrderNumber: string
  agentName: string
  memoText: string
  requestTitle: string
  senderName: string
}

export function MemoLandlordNotifiedEmail({
  branding,
  landlordName,
  propertyLabel,
  workOrderNumber,
  agentName,
  memoText,
  requestTitle,
  senderName,
}: MemoLandlordNotifiedEmailProps) {
  return (
    <EmailLayout branding={branding} preview={`Maintenance update from ${agentName} — ${workOrderNumber}`}>
      <Text style={{ fontSize: 15, lineHeight: "1.6", color: "#374151", margin: "0 0 16px" }}>
        Hi {landlordName},
      </Text>
      <Text style={{ fontSize: 15, lineHeight: "1.6", color: "#374151", margin: "0 0 16px" }}>
        {agentName} has added a note to the following maintenance request and chosen to share it with you.
      </Text>

      <Section style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8, padding: "16px 20px", margin: "0 0 20px" }}>
        <Text style={{ fontSize: 13, color: "#6b7280", margin: "0 0 4px" }}>Work order</Text>
        <Text style={{ fontSize: 14, fontFamily: "monospace", color: "#111827", margin: "0 0 12px" }}>{workOrderNumber}</Text>
        <Text style={{ fontSize: 13, color: "#6b7280", margin: "0 0 4px" }}>Property</Text>
        <Text style={{ fontSize: 15, color: "#111827", margin: "0 0 12px" }}>{propertyLabel}</Text>
        <Text style={{ fontSize: 13, color: "#6b7280", margin: "0 0 4px" }}>Request</Text>
        <Text style={{ fontSize: 15, color: "#111827", margin: 0 }}>{requestTitle}</Text>
      </Section>

      <Section style={{ background: "#ffffff", border: "1px solid #d1d5db", borderLeft: "3px solid #f59e0b", borderRadius: 4, padding: "14px 18px", margin: "0 0 20px" }}>
        <Text style={{ fontSize: 11, color: "#9ca3af", margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.08em" }}>
          Memo from {agentName}
        </Text>
        <Text style={{ fontSize: 15, lineHeight: "1.7", color: "#374151", margin: 0, whiteSpace: "pre-line" }}>
          {memoText}
        </Text>
      </Section>

      <Text style={{ fontSize: 13, color: "#9ca3af", lineHeight: "1.5", margin: "0 0 16px" }}>
        This note is visible to agents and was shared with you by {agentName}. Your tenant cannot see this memo.
      </Text>
      <Text style={{ fontSize: 15, lineHeight: "1.6", color: "#374151", margin: 0 }}>
        Kind regards,<br />{senderName}
      </Text>
    </EmailLayout>
  )
}
