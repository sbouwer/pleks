/**
 * lib/comms/templates/maintenance/contractor-changed.tsx — WO reassignment notice to old contractor
 *
 * Data:   contractor name, WO number, request title, property label, sender name
 * Notes:  Fired by changeContractor when prior status had an active WO token.
 *         Tells old contractor their portal link is revoked; no detail about new contractor.
 *         Email-only (transactional).
 */

import * as React from "react"
import { Section, Text } from "@react-email/components"
import { EmailLayout, type OrgBranding } from "../layout"

export interface ContractorChangedEmailProps {
  branding: OrgBranding
  contractorName: string
  workOrderNumber: string
  requestTitle: string
  propertyLabel: string
  senderName: string
}

export function ContractorChangedEmail({
  branding,
  contractorName,
  workOrderNumber,
  requestTitle,
  propertyLabel,
  senderName,
}: ContractorChangedEmailProps) {
  return (
    <EmailLayout branding={branding} preview={`Work order ${workOrderNumber} has been reassigned`}>
      <Text style={{ fontSize: 15, lineHeight: "1.6", color: "#374151", margin: "0 0 16px" }}>
        Hi {contractorName},
      </Text>
      <Text style={{ fontSize: 15, lineHeight: "1.6", color: "#374151", margin: "0 0 16px" }}>
        Please note that work order <strong>{workOrderNumber}</strong> has been reassigned to another contractor.
      </Text>

      <Section style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8, padding: "16px 20px", margin: "0 0 20px" }}>
        <Text style={{ fontSize: 13, color: "#6b7280", margin: "0 0 4px" }}>Work order</Text>
        <Text style={{ fontSize: 15, fontWeight: 600, color: "#111827", margin: "0 0 12px", fontFamily: "monospace" }}>{workOrderNumber}</Text>
        <Text style={{ fontSize: 13, color: "#6b7280", margin: "0 0 4px" }}>Job</Text>
        <Text style={{ fontSize: 15, color: "#111827", margin: "0 0 12px" }}>{requestTitle}</Text>
        <Text style={{ fontSize: 13, color: "#6b7280", margin: "0 0 4px" }}>Property</Text>
        <Text style={{ fontSize: 15, color: "#111827", margin: 0 }}>{propertyLabel}</Text>
      </Section>

      <Text style={{ fontSize: 15, lineHeight: "1.6", color: "#374151", margin: "0 0 16px" }}>
        Your work order portal link for this job is no longer active and no further action is required from you.
      </Text>
      <Text style={{ fontSize: 15, lineHeight: "1.6", color: "#374151", margin: "0 0 16px" }}>
        If you have already incurred any costs or carried out preparatory work, please contact us so we can discuss next steps.
      </Text>
      <Text style={{ fontSize: 15, lineHeight: "1.6", color: "#374151", margin: 0 }}>
        Thank you,<br />{senderName}
      </Text>
    </EmailLayout>
  )
}
