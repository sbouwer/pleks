/**
 * lib/comms/templates/tenant/inspections/inspection-dispute-window.tsx — move-out dispute window notice
 *
 * Data:   tenant name, property label, conducted date, dispute deadline, reference number, org branding
 * Notes:  Mandatory legal — RHA s5(3)(c) joint inspection requirement. 7-day procedural dispute
 *         window before deposit return schedule is issued. Formal voice. Email only.
 *         Stored in body_full for Tribunal evidence trail. Fired when move_out inspection
 *         transitions to awaiting_tenant_review. BUILD_63 Phase 4 (I6).
 */

import * as React from "react"
import { Section, Text } from "@react-email/components"
import { EmailLayout, type OrgBranding } from "../../layout"
import { LegalFooter } from "../../LegalFooter"
import { INSPECTION_BASIS } from "../../legalCitations"

export interface InspectionDisputeWindowEmailProps {
  branding: OrgBranding
  tenantName: string
  propertyLabel: string
  conductedDate: string
  disputeWindowClosesAt: string
  referenceNumber: string
}

export function InspectionDisputeWindowEmail({
  branding,
  tenantName,
  propertyLabel,
  conductedDate,
  disputeWindowClosesAt,
  referenceNumber,
}: Readonly<InspectionDisputeWindowEmailProps>) {
  const preview = `Move-out inspection — dispute window open — Ref ${referenceNumber}`

  return (
    <EmailLayout preview={preview} branding={branding}>
      <Text style={greet}>Dear {tenantName},</Text>

      <Text style={h1}>MOVE-OUT INSPECTION — DISPUTE WINDOW NOTICE</Text>
      <Text style={refLine}>Ref: {referenceNumber} · Property: {propertyLabel}</Text>

      <Text style={para}>
        Following the joint move-out inspection of the above property conducted pursuant to{" "}
        {INSPECTION_BASIS} read with the applicable clause of your Lease Agreement, you are advised
        that you have <strong>7 days</strong> from the date of this notice to dispute the inspection
        findings before the formal deposit return schedule is issued.
      </Text>

      <Section style={box}>
        <Text style={sectionHead}>Inspection Details</Text>
        <Text style={boxRow}><strong>Property:</strong> {propertyLabel}</Text>
        <Text style={boxRow}><strong>Inspection conducted:</strong> {conductedDate}</Text>
        <Text style={boxRow}><strong>Reference:</strong> {referenceNumber}</Text>
      </Section>

      <Section style={{ ...box, borderLeft: "3px solid #ef4444" }}>
        <Text style={sectionHead}>Your Right to Dispute — 7-Day Window</Text>
        <Text style={boxRow}>
          If you dispute any finding, you must notify us in writing{" "}
          <strong>before {disputeWindowClosesAt}</strong>. Disputes received after this date may
          not be considered. To dispute, reply to this email with your specific objections and
          supporting documentation (photographs, condition reports, prior correspondence).
        </Text>
      </Section>

      <Text style={para}>
        If no dispute is received before <strong>{disputeWindowClosesAt}</strong>, the inspection
        findings will be accepted and any applicable deductions will be processed in accordance
        with the deposit return schedule, which will be issued separately.
      </Text>

      <LegalFooter issuedUnder={
        <>
          This notice follows the joint move-out inspection conducted pursuant to section 5(3)(c)
          of the Rental Housing Act 50 of 1999. Reference: {referenceNumber}. Landlord agent: {branding.orgName}.
          If you believe this notice is incorrect, you may refer the matter to the Rental Housing
          Tribunal in your province.
        </>
      } />
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
