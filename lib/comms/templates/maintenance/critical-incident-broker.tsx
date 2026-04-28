/**
 * lib/comms/templates/maintenance/critical-incident-broker.tsx — FILL: one-line purpose
 *
 * FILL: fill in relevant fields and delete unused ones:
 * Route:  /the/url/this/renders
 * Auth:   what gate protects it (e.g. requireAdminAuth, gateway, AAL2)
 * Data:   where data comes from, any non-obvious access pattern
 * Notes:  gotchas, invariants, why-not-X decisions
 */
import * as React from "react"
import { Text, Hr } from "@react-email/components"
import { EmailLayout, EmailSectionHeading, type OrgBranding } from "../layout"

export interface CriticalIncidentBrokerProps {
  branding: OrgBranding
  propertyName: string
  propertyAddress: string
  unitLabel: string | null
  incidentTitle: string
  incidentDescription: string
  incidentDate: string        // formatted e.g. "14 March 2026 at 09:42"
  reportedByName: string
  agencyName: string
  appUrl: string
  maintenanceRequestId: string
  /** Date the checklist was last verified (most recent confirmed_at), formatted */
  coverageLastVerified?: string | null
  /** Labels of confirmed checklist items */
  confirmedItems?: string[]
  /** Labels of checklist items with unknown/unverified status */
  unknownItems?: string[]
}

export function CriticalIncidentBrokerEmail({
  branding,
  propertyName,
  propertyAddress,
  unitLabel,
  incidentTitle,
  incidentDescription,
  incidentDate,
  reportedByName,
  agencyName,
  appUrl,
  maintenanceRequestId,
  coverageLastVerified,
  confirmedItems,
  unknownItems,
}: Readonly<CriticalIncidentBrokerProps>) {
  return (
    <EmailLayout
      preview={`Critical incident reported: ${incidentTitle} — ${propertyName}`}
      branding={branding}
    >
      <EmailSectionHeading>Critical incident notification</EmailSectionHeading>

      <Text style={bodyText}>
        {agencyName} is reporting a critical incident at one of your insured properties that
        may require your attention.
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

      {(coverageLastVerified || confirmedItems?.length || unknownItems?.length) && (
        <>
          <EmailSectionHeading>Coverage on file</EmailSectionHeading>
          {coverageLastVerified && (
            <>
              <Text style={label}>Last verified</Text>
              <Text style={value}>{coverageLastVerified}</Text>
            </>
          )}
          {confirmedItems && confirmedItems.length > 0 && (
            <>
              <Text style={label}>Confirmed cover</Text>
              {confirmedItems.map((item) => (
                <Text key={item} style={checklistItem}>✓ {item}</Text>
              ))}
            </>
          )}
          {unknownItems && unknownItems.length > 0 && (
            <>
              <Text style={label}>Coverage not verified</Text>
              {unknownItems.map((item) => (
                <Text key={item} style={checklistItem}>? {item}</Text>
              ))}
            </>
          )}
          <Hr style={divider} />
        </>
      )}

      <Text style={bodyText}>
        This notification was sent on behalf of {agencyName} by {reportedByName}.
        The agency has logged the incident and is managing the repair process. Please contact
        them directly if you require additional information or wish to open a claim.
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
const checklistItem = { fontSize: "13px", color: "#374151", margin: "2px 0", paddingLeft: "4px" }
const footnote  = { fontSize: "11px", color: "#9ca3af", margin: "16px 0 0" }
