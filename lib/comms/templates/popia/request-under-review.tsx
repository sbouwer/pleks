/**
 * lib/comms/templates/popia/request-under-review.tsx — popia.request_under_review template
 *
 * Sent after identity verification — request advances to under_review.
 */
import * as React from "react"
import { Text, Link, Hr } from "@react-email/components"
import { EmailLayout, type OrgBranding } from "../layout"

export interface PopiaRequestUnderReviewEmailProps {
  branding: OrgBranding
  subjectName: string
  requestType: string
  agencyName: string
  slaDeadline: string
  requestId: string
  appUrl: string
}

export function PopiaRequestUnderReviewEmail({
  branding,
  subjectName,
  requestType,
  agencyName,
  slaDeadline,
  requestId,
  appUrl,
}: Readonly<PopiaRequestUnderReviewEmailProps>) {
  const preview = `Your ${requestType} request is under review — deadline ${slaDeadline}`

  return (
    <EmailLayout preview={preview} branding={branding}>
      <Text style={heading}>Your request is under review</Text>

      <Text style={para}>Hi {subjectName},</Text>

      <Text style={para}>
        Your identity has been verified. Your <strong>{requestType}</strong> request to{" "}
        <strong>{agencyName}</strong> is now under review. We will notify you when a decision
        has been made.
      </Text>

      <Text style={meta}>Response deadline: {slaDeadline}</Text>

      <Link href={`${appUrl}/tenant/privacy/requests/${requestId}`} style={cta}>
        View request status
      </Link>

      <Hr style={hr} />

      <Text style={footer}>
        Questions? Reply to this email or contact {agencyName} directly.
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
