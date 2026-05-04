/**
 * lib/comms/templates/maintenance/cancelled-contractor.tsx — WO cancellation notice to contractor
 *
 * Data:   contractor name, WO number, request title, property label, sender name
 * Notes:  Fired by cancelMaintenanceRequest when prior status had an active WO token.
 *         Informs contractor that their portal link is revoked. Transactional, email-only.
 */

import * as React from "react"
import { Section, Text } from "@react-email/components"
import { EmailLayout, type OrgBranding } from "../layout"

export interface CancelledContractorEmailProps {
  branding: OrgBranding
  contractorName: string
  workOrderNumber: string
  requestTitle: string
  propertyLabel: string
  senderName: string
}

export function CancelledContractorEmail({
  branding,
  contractorName,
  workOrderNumber,
  requestTitle,
  propertyLabel,
  senderName,
}: CancelledContractorEmailProps) {
  return (
    <EmailLayout branding={branding} preview={`Work order ${workOrderNumber} has been cancelled`}>
      <Text style={{ fontSize: 15, lineHeight: "1.6", color: "#374151", margin: "0 0 16px" }}>
        Hi {contractorName},
      </Text>
      <Text style={{ fontSize: 15, lineHeight: "1.6", color: "#374151", margin: "0 0 16px" }}>
        Please note that work order <strong>{workOrderNumber}</strong> has been cancelled.
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
        Your work order portal link for this job is no longer active. No further action is required on your end.
      </Text>
      <Text style={{ fontSize: 15, lineHeight: "1.6", color: "#374151", margin: "0 0 16px" }}>
        If you have already carried out any work or incurred expenses, please contact us directly.
      </Text>
      <Text style={{ fontSize: 15, lineHeight: "1.6", color: "#374151", margin: 0 }}>
        Thank you,<br />{senderName}
      </Text>
    </EmailLayout>
  )
}
