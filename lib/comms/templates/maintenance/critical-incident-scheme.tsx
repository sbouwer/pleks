import * as React from "react"
import { Text, Hr } from "@react-email/components"
import { EmailLayout, EmailSectionHeading, type OrgBranding } from "../layout"

export interface CriticalIncidentSchemeProps {
  branding: OrgBranding
  schemeName: string
  propertyName: string
  propertyAddress: string
  unitLabel: string | null
  incidentTitle: string
  incidentDescription: string
  incidentDate: string
  agencyName: string
  agentName: string
  agentPhone: string | null
  appUrl: string
  maintenanceRequestId: string
}

export function CriticalIncidentSchemeEmail({
  branding,
  schemeName,
  propertyName,
  propertyAddress,
  unitLabel,
  incidentTitle,
  incidentDescription,
  incidentDate,
  agencyName,
  agentName,
  agentPhone,
  appUrl,
  maintenanceRequestId,
}: Readonly<CriticalIncidentSchemeProps>) {
  return (
    <EmailLayout
      preview={`Critical incident at ${propertyName} — ${incidentTitle}`}
      branding={branding}
    >
      <EmailSectionHeading>Critical incident — {schemeName}</EmailSectionHeading>

      <Text style={bodyText}>
        {agencyName} is notifying {schemeName} of a critical incident at a property within the
        scheme. This notification is provided for your records and to allow the managing agent to
        take any necessary action regarding shared infrastructure or common areas.
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

      <Text style={bodyText}>
        The agency is managing the repair. If any common-property infrastructure is affected —
        including shared electrical, plumbing, or structural elements — please contact{" "}
        {agentName}{agentPhone ? ` on ${agentPhone}` : ""} at {agencyName} to coordinate access
        and repair scope.
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
