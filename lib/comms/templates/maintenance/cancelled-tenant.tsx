/**
 * lib/comms/templates/maintenance/cancelled-tenant.tsx — WO cancellation notice to tenant
 *
 * Data:   tenant name, property label, request title, sender name
 * Notes:  Fired by cancelMaintenanceRequest when logged_by='tenant'. Relational tone.
 *         Goes through routeAndSend (tenant-facing comms routing).
 */

import * as React from "react"
import { Section, Text } from "@react-email/components"
import { EmailLayout, type OrgBranding } from "../layout"

export interface CancelledTenantEmailProps {
  branding: OrgBranding
  tenantName: string
  propertyLabel: string
  requestTitle: string
  senderName: string
}

export function CancelledTenantEmail({
  branding,
  tenantName,
  propertyLabel,
  requestTitle,
  senderName,
}: CancelledTenantEmailProps) {
  return (
    <EmailLayout branding={branding} preview={`Your maintenance request has been closed`}>
      <Text style={{ fontSize: 15, lineHeight: "1.6", color: "#374151", margin: "0 0 16px" }}>
        Hi {tenantName},
      </Text>
      <Text style={{ fontSize: 15, lineHeight: "1.6", color: "#374151", margin: "0 0 16px" }}>
        We are writing to let you know that the following maintenance request has been closed.
      </Text>

      <Section style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8, padding: "16px 20px", margin: "0 0 20px" }}>
        <Text style={{ fontSize: 13, color: "#6b7280", margin: "0 0 4px" }}>Property</Text>
        <Text style={{ fontSize: 15, color: "#111827", margin: "0 0 12px" }}>{propertyLabel}</Text>
        <Text style={{ fontSize: 13, color: "#6b7280", margin: "0 0 4px" }}>Request</Text>
        <Text style={{ fontSize: 15, color: "#111827", margin: 0 }}>{requestTitle}</Text>
      </Section>

      <Text style={{ fontSize: 15, lineHeight: "1.6", color: "#374151", margin: "0 0 16px" }}>
        If you believe this was closed in error or the issue remains unresolved, please contact us and we will assist you further.
      </Text>
      <Text style={{ fontSize: 15, lineHeight: "1.6", color: "#374151", margin: 0 }}>
        Kind regards,<br />{senderName}
      </Text>
    </EmailLayout>
  )
}
