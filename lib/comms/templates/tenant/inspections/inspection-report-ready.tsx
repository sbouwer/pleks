/**
 * lib/comms/templates/tenant/inspections/inspection-report-ready.tsx — inspection report available
 *
 * Data:   tenant name, property label, inspection type, conducted date, overall condition, org branding
 * Notes:  Transactional tone. Fired for periodic (residential) and completed (commercial) inspections.
 *         BUILD_63 Phase 4 (I5).
 */

import * as React from "react"
import { Section, Text } from "@react-email/components"
import { EmailLayout, type OrgBranding } from "../../layout"

export interface InspectionReportReadyEmailProps {
  branding: OrgBranding
  tenantName: string
  propertyLabel: string
  inspectionTypeLabel: string
  conductedDate: string
  overallCondition?: string | null
  senderName: string
}

function formatCondition(c: string | null | undefined): string {
  if (!c) return "On record"
  return c.charAt(0).toUpperCase() + c.slice(1).toLowerCase().replace(/_/g, " ")
}

export function InspectionReportReadyEmail({
  branding,
  tenantName,
  propertyLabel,
  inspectionTypeLabel,
  conductedDate,
  overallCondition,
  senderName,
}: Readonly<InspectionReportReadyEmailProps>) {
  const preview = `${inspectionTypeLabel} report ready — ${propertyLabel}`

  return (
    <EmailLayout preview={preview} branding={branding}>
      <Text style={greet}>Dear {tenantName},</Text>

      <Text style={h1}>{inspectionTypeLabel} Report Available</Text>

      <Text style={para}>
        The <strong>{inspectionTypeLabel}</strong> conducted at <strong>{propertyLabel}</strong> on{" "}
        <strong>{conductedDate}</strong> has been completed. Your inspection report is now available.
      </Text>

      <Section style={box}>
        <Text style={sectionHead}>Inspection Summary</Text>
        <Text style={boxRow}><strong>Property:</strong> {propertyLabel}</Text>
        <Text style={boxRow}><strong>Type:</strong> {inspectionTypeLabel}</Text>
        <Text style={boxRow}><strong>Conducted on:</strong> {conductedDate}</Text>
        {overallCondition && (
          <Text style={boxRow}><strong>Overall condition:</strong> {formatCondition(overallCondition)}</Text>
        )}
      </Section>

      <Text style={para}>
        Please log in to your tenant portal to view the full inspection report. If you have any
        questions or concerns about the findings, please contact your property manager.
      </Text>

      <Text style={sign}>Kind regards,<br />{senderName}</Text>
    </EmailLayout>
  )
}

const greet:       React.CSSProperties = { fontSize: 14, color: "#3f3f46", margin: "0 0 8px" }
const h1:          React.CSSProperties = { fontSize: 20, fontWeight: 700, color: "#18181b", margin: "0 0 16px" }
const para:        React.CSSProperties = { fontSize: 14, color: "#3f3f46", lineHeight: "1.6", margin: "0 0 16px" }
const box:         React.CSSProperties = { background: "#f4f4f5", borderRadius: 6, padding: "12px 16px", margin: "0 0 16px" }
const sectionHead: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "#71717a", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 8px" }
const boxRow:      React.CSSProperties = { fontSize: 13, color: "#3f3f46", margin: "2px 0" }
const sign:        React.CSSProperties = { fontSize: 14, color: "#3f3f46", margin: "24px 0 0" }
