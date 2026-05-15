/**
 * lib/comms/templates/popia/request-rejected.tsx — popia.request_rejected template
 *
 * Sent on rejection. Includes legal basis, resolution notes, and IR escalation path.
 * D-POPIA-19: IR contact details required whenever subject exercises rights.
 */
import * as React from "react"
import { Text, Link, Hr } from "@react-email/components"
import { EmailLayout, type OrgBranding } from "../layout"

export interface PopiaRequestRejectedEmailProps {
  branding: OrgBranding
  subjectName: string
  requestType: string
  agencyName: string
  resolutionNotes: string
  legalBasis: string
  requestId: string
  appUrl: string
}

export function PopiaRequestRejectedEmail({
  branding,
  subjectName,
  requestType,
  agencyName,
  resolutionNotes,
  legalBasis,
  requestId,
  appUrl,
}: Readonly<PopiaRequestRejectedEmailProps>) {
  const preview = `Your ${requestType} request was not approved — you have the right to escalate`

  return (
    <EmailLayout preview={preview} branding={branding}>
      <Text style={heading}>Your request could not be fulfilled</Text>

      <Text style={para}>Hi {subjectName},</Text>

      <Text style={para}>
        <strong>{agencyName}</strong> has reviewed your <strong>{requestType}</strong> request
        and is unable to fulfil it at this time.
      </Text>

      <Text style={sectionLabel}>Reason</Text>
      <Text style={notes}>{resolutionNotes}</Text>

      <Text style={sectionLabel}>Legal basis</Text>
      <Text style={notes}>{legalBasis}</Text>

      <Link href={`${appUrl}/tenant/privacy/requests/${requestId}`} style={cta}>
        View your request
      </Link>

      <Hr style={hr} />

      <Text style={escalationHeading}>Your right to escalate</Text>
      <Text style={footer}>
        If you believe this decision is incorrect, you have the unconditional right to complain
        to the Information Regulator of South Africa. The regulator operates independently of
        Pleks and {agencyName}.
      </Text>
      <Text style={footer}>
        Email: complaints.IR@justice.gov.za<br />
        Phone: +27 10 023 5207<br />
        Address: JD House, 27 Stiemens Street, Braamfontein, Johannesburg, 2001
      </Text>
      <Link href="https://www.justice.gov.za/inforeg/" style={irLink}>
        www.justice.gov.za/inforeg
      </Link>
    </EmailLayout>
  )
}

const heading: React.CSSProperties = { fontSize: 20, fontWeight: 700, color: "#111827", margin: "0 0 12px" }
const para: React.CSSProperties = { fontSize: 15, color: "#374151", lineHeight: "1.6", margin: "0 0 8px" }
const sectionLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9ca3af", margin: "16px 0 4px" }
const notes: React.CSSProperties = { fontSize: 14, color: "#374151", backgroundColor: "#f9fafb", borderLeft: "3px solid #e5e7eb", padding: "10px 14px", margin: "0 0 8px" }
const cta: React.CSSProperties = { display: "inline-block", backgroundColor: "#111827", color: "#fff", padding: "10px 20px", borderRadius: 6, textDecoration: "none", fontSize: 14, fontWeight: 600, margin: "16px 0 20px" }
const hr: React.CSSProperties = { margin: "24px 0", borderColor: "#e5e7eb" }
const escalationHeading: React.CSSProperties = { fontSize: 15, fontWeight: 700, color: "#111827", margin: "0 0 8px" }
const footer: React.CSSProperties = { fontSize: 13, color: "#6b7280", lineHeight: "1.6", margin: "0 0 6px" }
const irLink: React.CSSProperties = { fontSize: 13, color: "#374151", margin: "8px 0 0" }
