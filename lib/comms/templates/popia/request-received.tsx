/**
 * lib/comms/templates/popia/request-received.tsx — popia.request_received template
 *
 * Sent to the subject immediately after a data-subject request is submitted.
 * D-POPIA-04: 30-day SLA. is_mandatory (legal requirement).
 */
import * as React from "react"
import { Text, Link, Hr } from "@react-email/components"
import { EmailLayout, type OrgBranding } from "../layout"

export interface PopiaRequestReceivedEmailProps {
  branding: OrgBranding
  subjectName: string
  requestType: string
  agencyName: string
  slaDeadline: string
  requestId: string
  appUrl: string
}

export function PopiaRequestReceivedEmail({
  branding,
  subjectName,
  requestType,
  agencyName,
  slaDeadline,
  requestId,
  appUrl,
}: Readonly<PopiaRequestReceivedEmailProps>) {
  const preview = `Your ${requestType} request has been received — response by ${slaDeadline}`

  return (
    <EmailLayout preview={preview} branding={branding}>
      <Text style={heading}>Your POPIA request has been received</Text>

      <Text style={para}>Hi {subjectName},</Text>

      <Text style={para}>
        Your <strong>{requestType}</strong> request to <strong>{agencyName}</strong> was received
        successfully. We are required by POPIA to respond within 30 calendar days.
      </Text>

      <Text style={meta}>
        Request ID: {requestId.slice(0, 8).toUpperCase()}<br />
        Response deadline: {slaDeadline}
      </Text>

      <Link href={`${appUrl}/tenant/privacy/requests/${requestId}`} style={cta}>
        View your request
      </Link>

      <Hr style={hr} />

      <Text style={footer}>
        If you do not receive a response by {slaDeadline}, you have the right to complain to the
        Information Regulator of South Africa at complaints.IR@justice.gov.za or +27 10 023 5207.
      </Text>
    </EmailLayout>
  )
}

const heading: React.CSSProperties = { fontSize: 20, fontWeight: 700, color: "#111827", margin: "0 0 12px" }
const para: React.CSSProperties = { fontSize: 15, color: "#374151", lineHeight: "1.6", margin: "0 0 8px" }
const meta: React.CSSProperties = { fontSize: 13, color: "#6b7280", margin: "0 0 20px", fontFamily: "monospace" }
const cta: React.CSSProperties = { display: "inline-block", backgroundColor: "#111827", color: "#fff", padding: "10px 20px", borderRadius: 6, textDecoration: "none", fontSize: 14, fontWeight: 600, margin: "0 0 20px" }
const hr: React.CSSProperties = { margin: "24px 0", borderColor: "#e5e7eb" }
const footer: React.CSSProperties = { fontSize: 12, color: "#9ca3af", lineHeight: "1.5" }
