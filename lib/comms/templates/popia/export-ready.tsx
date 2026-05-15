/**
 * lib/comms/templates/popia/export-ready.tsx — popia.export_ready template
 *
 * Sent when a data export bundle is ready for download (access/portability requests).
 * D-POPIA-11: 7-day signed URL TTL. D-POPIA-12: manifest hash for tamper evidence.
 */
import * as React from "react"
import { Text, Link, Hr } from "@react-email/components"
import { EmailLayout, type OrgBranding } from "../layout"

export interface PopiaExportReadyEmailProps {
  branding: OrgBranding
  subjectName: string
  agencyName: string
  requestType: string
  downloadUrl: string
  expiresAt: string
  manifestHash: string
  requestId: string
  appUrl: string
}

export function PopiaExportReadyEmail({
  branding,
  subjectName,
  agencyName,
  requestType,
  downloadUrl,
  expiresAt,
  manifestHash,
  requestId,
  appUrl,
}: Readonly<PopiaExportReadyEmailProps>) {
  const preview = `Your data export from ${agencyName} is ready — download expires ${expiresAt}`

  return (
    <EmailLayout preview={preview} branding={branding}>
      <Text style={heading}>Your data export is ready</Text>

      <Text style={para}>Hi {subjectName},</Text>

      <Text style={para}>
        <strong>{agencyName}</strong> has prepared your <strong>{requestType}</strong> data
        export. The bundle includes a PDF summary, a machine-readable JSON file, and where
        applicable, supporting documents.
      </Text>

      <Link href={downloadUrl} style={cta}>
        Download your data export
      </Link>

      <Text style={warning}>
        This link expires on {expiresAt}. After that, contact {agencyName} to request a new link.
      </Text>

      <Text style={sectionLabel}>Tamper evidence</Text>
      <Text style={hashText}>{manifestHash}</Text>
      <Text style={hashNote}>
        This SHA-256 manifest hash uniquely identifies your export bundle. If you ever need to
        verify that the export has not been altered since it was issued, provide this hash to
        the Information Regulator.
      </Text>

      <Hr style={hr} />

      <Link href={`${appUrl}/tenant/privacy/requests/${requestId}`} style={viewLink}>
        View request record
      </Link>
    </EmailLayout>
  )
}

const heading: React.CSSProperties = { fontSize: 20, fontWeight: 700, color: "#111827", margin: "0 0 12px" }
const para: React.CSSProperties = { fontSize: 15, color: "#374151", lineHeight: "1.6", margin: "0 0 8px" }
const cta: React.CSSProperties = { display: "inline-block", backgroundColor: "#111827", color: "#fff", padding: "10px 20px", borderRadius: 6, textDecoration: "none", fontSize: 14, fontWeight: 600, margin: "8px 0 16px" }
const warning: React.CSSProperties = { fontSize: 13, color: "#d97706", margin: "0 0 20px" }
const sectionLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9ca3af", margin: "16px 0 4px" }
const hashText: React.CSSProperties = { fontSize: 11, fontFamily: "monospace", color: "#374151", backgroundColor: "#f9fafb", padding: "8px 12px", borderRadius: 4, margin: "0 0 6px", wordBreak: "break-all" }
const hashNote: React.CSSProperties = { fontSize: 12, color: "#9ca3af", lineHeight: "1.5", margin: "0 0 16px" }
const hr: React.CSSProperties = { margin: "24px 0", borderColor: "#e5e7eb" }
const viewLink: React.CSSProperties = { fontSize: 13, color: "#6b7280" }
