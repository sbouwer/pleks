/**
 * lib/comms/templates/popia/request-approved.tsx — popia.request_approved template
 *
 * Sent on approval for non-nuke, non-export requests (correction, objection, etc.).
 * For access/portability, popia.export_ready is sent instead.
 */
import * as React from "react"
import { Text, Link, Hr } from "@react-email/components"
import { EmailLayout, type OrgBranding } from "../layout"

export interface PopiaRequestApprovedEmailProps {
  branding: OrgBranding
  subjectName: string
  requestType: string
  agencyName: string
  resolutionNotes: string | null
  requestId: string
  appUrl: string
}

export function PopiaRequestApprovedEmail({
  branding,
  subjectName,
  requestType,
  agencyName,
  resolutionNotes,
  requestId,
  appUrl,
}: Readonly<PopiaRequestApprovedEmailProps>) {
  const preview = `Your ${requestType} request has been completed by ${agencyName}`

  return (
    <EmailLayout preview={preview} branding={branding}>
      <Text style={heading}>Your request has been completed</Text>

      <Text style={para}>Hi {subjectName},</Text>

      <Text style={para}>
        <strong>{agencyName}</strong> has completed your <strong>{requestType}</strong> request.
      </Text>

      {resolutionNotes && (
        <Text style={notes}>{resolutionNotes}</Text>
      )}

      <Link href={`${appUrl}/tenant/privacy/requests/${requestId}`} style={cta}>
        View full details
      </Link>

      <Hr style={hr} />

      <Text style={footer}>
        If you are not satisfied with this response, you may complain to the Information
        Regulator at complaints.IR@justice.gov.za or +27 10 023 5207.
      </Text>
    </EmailLayout>
  )
}

const heading: React.CSSProperties = { fontSize: 20, fontWeight: 700, color: "#111827", margin: "0 0 12px" }
const para: React.CSSProperties = { fontSize: 15, color: "#374151", lineHeight: "1.6", margin: "0 0 8px" }
const notes: React.CSSProperties = { fontSize: 14, color: "#374151", backgroundColor: "#f9fafb", borderLeft: "3px solid #e5e7eb", padding: "10px 14px", margin: "0 0 20px" }
const cta: React.CSSProperties = { display: "inline-block", backgroundColor: "#111827", color: "#fff", padding: "10px 20px", borderRadius: 6, textDecoration: "none", fontSize: 14, fontWeight: 600, margin: "0 0 20px" }
const hr: React.CSSProperties = { margin: "24px 0", borderColor: "#e5e7eb" }
const footer: React.CSSProperties = { fontSize: 12, color: "#9ca3af", lineHeight: "1.5" }
