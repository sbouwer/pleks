/**
 * lib/comms/templates/popia/nuke-confirmation.tsx — popia.nuke_confirmation template
 *
 * Sent after a nuke request completes. Lists deleted, anonymised, and retained categories.
 * D-POPIA-05: pre-confirmed carve-outs referenced; no surprise retentions.
 */
import * as React from "react"
import { Text, Link, Hr } from "@react-email/components"
import { EmailLayout, type OrgBranding } from "../layout"

interface ErasureSummary {
  deleted: number
  anonymised: number
  retained: number
}

export interface PopiaNukeConfirmationEmailProps {
  branding: OrgBranding
  subjectName: string
  agencyName: string
  summary: ErasureSummary
  retainedCategories: { category: string; reason: string }[]
  requestId: string
  appUrl: string
  resolvedAt: string
}

export function PopiaNukeConfirmationEmail({
  branding,
  subjectName,
  agencyName,
  summary,
  retainedCategories,
  requestId,
  appUrl,
  resolvedAt,
}: Readonly<PopiaNukeConfirmationEmailProps>) {
  const preview = `Full erasure complete — ${summary.deleted} records deleted, ${summary.retained} retained per law`

  return (
    <EmailLayout preview={preview} branding={branding}>
      <Text style={heading}>Full erasure completed</Text>

      <Text style={para}>Hi {subjectName},</Text>

      <Text style={para}>
        <strong>{agencyName}</strong> has completed your full erasure request on{" "}
        {resolvedAt}. Here is a summary of what was done.
      </Text>

      <Text style={sectionLabel}>What happened</Text>
      <Text style={meta}>
        Records deleted: {summary.deleted}<br />
        Records anonymised (identifying fields replaced): {summary.anonymised}<br />
        Records retained (legal requirement): {summary.retained}
      </Text>

      {retainedCategories.length > 0 && (
        <>
          <Text style={sectionLabel}>Retained as disclosed</Text>
          <Text style={para}>
            The following categories were retained as you acknowledged before submitting:
          </Text>
          {retainedCategories.map(({ category, reason }) => (
            <Text key={category} style={retainedRow}>
              <strong>{category}</strong> — {reason}
            </Text>
          ))}
        </>
      )}

      <Link href={`${appUrl}/tenant/privacy/requests/${requestId}`} style={cta}>
        View request record
      </Link>

      <Hr style={hr} />

      <Text style={footer}>
        This confirmation is your record. The consent log entry for this erasure is retained
        permanently per POPIA accountability requirements and was not deleted.
      </Text>
      <Text style={footer}>
        If you have questions, contact {agencyName} directly. To escalate to the Information
        Regulator: complaints.IR@justice.gov.za · +27 10 023 5207.
      </Text>
    </EmailLayout>
  )
}

const heading: React.CSSProperties = { fontSize: 20, fontWeight: 700, color: "#111827", margin: "0 0 12px" }
const para: React.CSSProperties = { fontSize: 15, color: "#374151", lineHeight: "1.6", margin: "0 0 8px" }
const sectionLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9ca3af", margin: "16px 0 4px" }
const meta: React.CSSProperties = { fontSize: 13, color: "#6b7280", fontFamily: "monospace", lineHeight: "1.8", margin: "0 0 16px" }
const retainedRow: React.CSSProperties = { fontSize: 13, color: "#374151", borderLeft: "3px solid #e5e7eb", padding: "4px 12px", margin: "0 0 4px" }
const cta: React.CSSProperties = { display: "inline-block", backgroundColor: "#111827", color: "#fff", padding: "10px 20px", borderRadius: 6, textDecoration: "none", fontSize: 14, fontWeight: 600, margin: "16px 0 20px" }
const hr: React.CSSProperties = { margin: "24px 0", borderColor: "#e5e7eb" }
const footer: React.CSSProperties = { fontSize: 12, color: "#9ca3af", lineHeight: "1.6", margin: "0 0 6px" }
