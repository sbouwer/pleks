/**
 * lib/comms/templates/popia/policy-update.tsx — popia.policy_update template
 *
 * Sent when privacy_policy_versions is updated with change_type='material'.
 * D-POPIA-09: soft banner + acknowledgement; blocking re-accept is Tier 2.
 */
import * as React from "react"
import { Text, Link, Hr } from "@react-email/components"
import { EmailLayout, type OrgBranding } from "../layout"

export interface PopiaPolicyUpdateEmailProps {
  branding: OrgBranding
  recipientName: string
  newVersion: string
  oldVersion: string
  changeSummary: string
  effectiveFrom: string
  policyUrl: string
}

export function PopiaPolicyUpdateEmail({
  branding,
  recipientName,
  newVersion,
  oldVersion,
  changeSummary,
  effectiveFrom,
  policyUrl,
}: Readonly<PopiaPolicyUpdateEmailProps>) {
  const preview = `Pleks privacy policy updated — effective ${effectiveFrom}`

  return (
    <EmailLayout preview={preview} branding={branding}>
      <Text style={heading}>Pleks Privacy Notice updated</Text>

      <Text style={para}>Hi {recipientName},</Text>

      <Text style={para}>
        We have updated the Pleks Privacy Notice. The new version ({newVersion}) is effective
        from <strong>{effectiveFrom}</strong>.
      </Text>

      <Text style={sectionLabel}>What changed</Text>
      <Text style={notes}>{changeSummary}</Text>

      <Link href={policyUrl} style={cta}>
        Read the updated policy
      </Link>

      <Hr style={hr} />

      <Text style={footer}>
        The previous version ({oldVersion}) remains available at{" "}
        <Link href={`https://pleks.co.za/privacy/versions/${oldVersion}`} style={{ color: "#6b7280" }}>
          pleks.co.za/privacy/versions/{oldVersion}
        </Link>{" "}
        for your reference.
      </Text>
      <Text style={footer}>
        If you have questions about these changes, contact privacy@pleks.co.za or the Information
        Regulator at complaints.IR@justice.gov.za.
      </Text>
    </EmailLayout>
  )
}

const heading: React.CSSProperties = { fontSize: 20, fontWeight: 700, color: "#111827", margin: "0 0 12px" }
const para: React.CSSProperties = { fontSize: 15, color: "#374151", lineHeight: "1.6", margin: "0 0 8px" }
const sectionLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "#9ca3af", margin: "16px 0 4px" }
const notes: React.CSSProperties = { fontSize: 14, color: "#374151", backgroundColor: "#f9fafb", borderLeft: "3px solid #e5e7eb", padding: "10px 14px", margin: "0 0 20px" }
const cta: React.CSSProperties = { display: "inline-block", backgroundColor: "#111827", color: "#fff", padding: "10px 20px", borderRadius: 6, textDecoration: "none", fontSize: 14, fontWeight: 600, margin: "0 0 20px" }
const hr: React.CSSProperties = { margin: "24px 0", borderColor: "#e5e7eb" }
const footer: React.CSSProperties = { fontSize: 12, color: "#9ca3af", lineHeight: "1.6", margin: "0 0 6px" }
