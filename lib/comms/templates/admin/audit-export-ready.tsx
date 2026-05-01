/**
 * lib/comms/templates/admin/audit-export-ready.tsx — admin.audit_export_ready template
 *
 * Sent to the platform admin when an async audit CSV export has been processed.
 */
import * as React from "react"
import { Text, Link, Hr } from "@react-email/components"
import { EmailLayout, type OrgBranding } from "../layout"

export interface AuditExportReadyEmailProps {
  branding:   OrgBranding
  downloadUrl: string
  rowCount:   number
  filterSummary: string
  expiresIn:  string   // e.g. "7 days"
}

export function AuditExportReadyEmail({
  branding,
  downloadUrl,
  rowCount,
  filterSummary,
  expiresIn,
}: Readonly<AuditExportReadyEmailProps>) {
  const preview = `Your audit log export is ready — ${rowCount.toLocaleString()} rows`

  return (
    <EmailLayout preview={preview} branding={branding}>
      <Text style={heading}>Audit log export ready</Text>

      <Text style={para}>
        Your export has been processed and is ready to download.
      </Text>

      <Text style={meta}>
        <strong>{rowCount.toLocaleString()}</strong> rows · {filterSummary}
      </Text>

      <Link href={downloadUrl} style={cta}>
        Download CSV
      </Link>

      <Hr style={{ margin: "24px 0", borderColor: "#e5e7eb" }} />

      <Text style={footer}>
        This link expires in {expiresIn}. After that, re-run the export from the admin audit log.
      </Text>
    </EmailLayout>
  )
}

const heading: React.CSSProperties = {
  fontSize: 20,
  fontWeight: 700,
  color: "#111827",
  margin: "0 0 12px",
}

const para: React.CSSProperties = {
  fontSize: 15,
  color: "#374151",
  lineHeight: "1.6",
  margin: "0 0 8px",
}

const meta: React.CSSProperties = {
  fontSize: 13,
  color: "#6b7280",
  margin: "0 0 20px",
  fontFamily: "monospace",
}

const cta: React.CSSProperties = {
  display: "inline-block",
  padding: "10px 20px",
  background: "#111827",
  color: "#ffffff",
  borderRadius: 6,
  fontSize: 14,
  fontWeight: 600,
  textDecoration: "none",
}

const footer: React.CSSProperties = {
  fontSize: 12,
  color: "#9ca3af",
  margin: 0,
}
