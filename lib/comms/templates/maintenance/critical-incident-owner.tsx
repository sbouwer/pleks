import * as React from "react"
import { Text, Hr } from "@react-email/components"
import { EmailLayout, EmailSectionHeading, type OrgBranding } from "../layout"

export interface CriticalIncidentOwnerProps {
  branding: OrgBranding
  ownerName: string
  propertyName: string
  propertyAddress: string
  unitLabel: string | null
  incidentTitle: string
  incidentDescription: string
  incidentDate: string
  brokerName: string | null
  brokerNotified: boolean
  agencyName: string
  agentName: string
  appUrl: string
  maintenanceRequestId: string
}

export function CriticalIncidentOwnerEmail({
  branding,
  ownerName,
  propertyName,
  propertyAddress,
  unitLabel,
  incidentTitle,
  incidentDescription,
  incidentDate,
  brokerName,
  brokerNotified,
  agencyName,
  agentName,
  appUrl,
  maintenanceRequestId,
}: Readonly<CriticalIncidentOwnerProps>) {
  return (
    <EmailLayout
      preview={`Incident update for ${propertyName}: ${incidentTitle}`}
      branding={branding}
    >
      <EmailSectionHeading>Incident report — {propertyName}</EmailSectionHeading>

      <Text style={bodyText}>Dear {ownerName},</Text>
      <Text style={bodyText}>
        We are writing to inform you of a critical incident at your property that was reported on{" "}
        {incidentDate}. We are managing the situation and wanted to ensure you have a written record.
      </Text>

      <Hr style={divider} />

      <Text style={label}>Property</Text>
      <Text style={value}>{propertyName}</Text>
      <Text style={sub}>{propertyAddress}</Text>

      {unitLabel && (
        <>
          <Text style={label}>Unit / area affected</Text>
          <Text style={value}>{unitLabel}</Text>
        </>
      )}

      <Text style={label}>Incident</Text>
      <Text style={value}>{incidentTitle}</Text>

      <Text style={label}>Date reported</Text>
      <Text style={value}>{incidentDate}</Text>

      <Text style={label}>Description</Text>
      <Text style={bodyText}>{incidentDescription}</Text>

      <Hr style={divider} />

      {brokerNotified && brokerName ? (
        <Text style={bodyText}>
          We have notified your insurance broker ({brokerName}) of this incident on your behalf.
          Please follow up with them directly if you wish to open a claim.
        </Text>
      ) : (
        <Text style={bodyText}>
          Please review this incident and contact your insurance broker if you believe a claim is
          appropriate.
        </Text>
      )}

      <Text style={bodyText}>
        Your property is being managed by {agencyName}. If you have any questions, please
        contact {agentName} directly.
      </Text>

      <Text style={footnote}>
        Reference: {appUrl}/maintenance/{maintenanceRequestId}
      </Text>
    </EmailLayout>
  )
}

const bodyText  = { fontSize: "14px", lineHeight: "1.6", color: "#374151", margin: "0 0 12px" }
const label     = { fontSize: "11px", fontWeight: "600" as const, textTransform: "uppercase" as const, letterSpacing: "0.05em", color: "#6b7280", margin: "12px 0 2px" }
const value     = { fontSize: "14px", fontWeight: "600" as const, color: "#111827", margin: "0 0 4px" }
const sub       = { fontSize: "13px", color: "#6b7280", margin: "0 0 8px" }
const divider   = { borderColor: "#e5e7eb", margin: "16px 0" }
const footnote  = { fontSize: "11px", color: "#9ca3af", margin: "16px 0 0" }
