/**
 * lib/comms/templates/tenant/inspections/inspection-move-in-report.tsx — move-in inspection report
 *
 * Data:   tenant name, property label, conducted date, overall condition, reference number, org branding
 * Notes:  Mandatory legal — RHA s5(3)(c) joint inspection requirement. Formal voice. Single variant. Email only.
 *         Serves as the baseline condition record for the tenancy. Fired when move_in inspection
 *         transitions to awaiting_tenant_review. BUILD_63 Phase 4 (I4).
 */

import * as React from "react"
import { Section, Text, Hr } from "@react-email/components"
import { EmailLayout, type OrgBranding } from "../../layout"

export interface InspectionMoveInReportEmailProps {
  branding: OrgBranding
  tenantName: string
  propertyLabel: string
  conductedDate: string
  overallCondition?: string | null
  referenceNumber: string
}

function formatCondition(c: string | null | undefined): string {
  if (!c) return "On record"
  return c.charAt(0).toUpperCase() + c.slice(1).toLowerCase().replace(/_/g, " ")
}

export function InspectionMoveInReportEmail({
  branding,
  tenantName,
  propertyLabel,
  conductedDate,
  overallCondition,
  referenceNumber,
}: Readonly<InspectionMoveInReportEmailProps>) {
  const preview = `Move-in inspection report — ${propertyLabel} — Ref ${referenceNumber}`

  return (
    <EmailLayout preview={preview} branding={branding}>
      <Text style={greet}>Dear {tenantName},</Text>

      <Text style={h1}>MOVE-IN INSPECTION REPORT</Text>
      <Text style={refLine}>Ref: {referenceNumber} · Property: {propertyLabel}</Text>

      <Text style={para}>
        Following the joint move-in inspection conducted pursuant to section 5(3)(c) of the Rental
        Housing Act 50 of 1999, please find below the official record of the property&apos;s condition
        at the commencement of your tenancy.
      </Text>

      <Section style={box}>
        <Text style={sectionHead}>Inspection Summary</Text>
        <Text style={boxRow}><strong>Property:</strong> {propertyLabel}</Text>
        <Text style={boxRow}><strong>Inspection date:</strong> {conductedDate}</Text>
        <Text style={boxRow}><strong>Overall condition:</strong> {formatCondition(overallCondition)}</Text>
        <Text style={boxRow}><strong>Reference:</strong> {referenceNumber}</Text>
      </Section>

      <Text style={para}>
        This report is the baseline record against which the property&apos;s condition will be assessed
        at the end of your tenancy. It will be used in the event of any deposit deduction claims.
      </Text>

      <Section style={{ ...box, borderLeft: "3px solid #3b82f6" }}>
        <Text style={sectionHead}>Your Right to Disagree</Text>
        <Text style={boxRow}>
          If you disagree with any aspect of this report, you must notify us in writing within
          <strong> 7 days</strong> of receiving this notice. Please reply to this email with your
          specific objections and supporting evidence (photographs, prior correspondence).
          Objections received after this period may not be considered.
        </Text>
      </Section>

      <Hr style={{ borderColor: "#e4e4e7", margin: "24px 0" }} />
      <Text style={small}>
        This report documents the joint inspection conducted pursuant to section 5(3)(c) of the
        Rental Housing Act 50 of 1999. Reference: {referenceNumber}. Landlord agent: {branding.orgName}.
        This document is maintained as Tribunal evidence. If you believe the report is inaccurate,
        you may refer the matter to the Rental Housing Tribunal in your province.
      </Text>
    </EmailLayout>
  )
}

const greet:       React.CSSProperties = { fontSize: 14, color: "#3f3f46", margin: "0 0 8px" }
const h1:          React.CSSProperties = { fontSize: 20, fontWeight: 700, color: "#18181b", margin: "0 0 4px" }
const refLine:     React.CSSProperties = { fontSize: 12, color: "#71717a", margin: "0 0 20px" }
const para:        React.CSSProperties = { fontSize: 14, color: "#3f3f46", lineHeight: "1.6", margin: "0 0 16px" }
const box:         React.CSSProperties = { background: "#f4f4f5", borderRadius: 6, padding: "12px 16px", margin: "0 0 16px" }
const sectionHead: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "#71717a", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 8px" }
const boxRow:      React.CSSProperties = { fontSize: 13, color: "#3f3f46", margin: "2px 0" }
const small:       React.CSSProperties = { fontSize: 12, color: "#71717a", margin: 0 }
