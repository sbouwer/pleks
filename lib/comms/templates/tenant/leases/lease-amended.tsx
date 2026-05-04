/**
 * lib/comms/templates/tenant/leases/lease-amended.tsx — lease charge added/removed notification (L6)
 *
 * Data:   tenant name, property label, change description, amount, org branding
 * Notes:  Fires on lease_charges POST (charge added) and DELETE (charge removed) for active leases.
 *         changeType defaults to "added". BUILD_63 Phase 5.
 */

import * as React from "react"
import { Section, Text, Hr } from "@react-email/components"
import { EmailLayout, type OrgBranding } from "../../layout"

export interface LeaseAmendedEmailProps {
  branding: OrgBranding
  tenantName: string
  propertyLabel: string
  chargeDescription: string
  chargeAmountDisplay: string
  effectiveDate: string
  senderName: string
  changeType?: "added" | "removed"
}

export function LeaseAmendedEmail({
  branding,
  tenantName,
  propertyLabel,
  chargeDescription,
  chargeAmountDisplay,
  effectiveDate,
  senderName,
  changeType = "added",
}: Readonly<LeaseAmendedEmailProps>) {
  const preview = `Your lease for ${propertyLabel} has been updated`
  const isRemoval = changeType === "removed"

  return (
    <EmailLayout preview={preview} branding={branding}>
      <Text style={greet}>Dear {tenantName},</Text>

      <Text style={h1}>Lease update — {isRemoval ? "charge removed" : "new charge added"}</Text>

      <Text style={para}>
        A change has been made to your lease for <strong>{propertyLabel}</strong>. Please review
        the details below.
      </Text>

      <Section style={box}>
        <Text style={sectionHead}>Change Details</Text>
        <Text style={boxRow}><strong>Charge:</strong> {chargeDescription}</Text>
        <Text style={boxRow}><strong>Amount:</strong> {chargeAmountDisplay} per month</Text>
        <Text style={boxRow}><strong>{isRemoval ? "Last effective:" : "Effective from:"}</strong> {effectiveDate}</Text>
      </Section>

      <Text style={para}>
        {isRemoval
          ? `This charge will no longer appear on your monthly invoice after the above date. If you have any questions, please contact ${branding.orgEmail ?? senderName}.`
          : `This charge will be included in your monthly invoice from the effective date. If you have any questions, please contact ${branding.orgEmail ?? senderName}.`
        }
      </Text>

      <Hr style={{ borderColor: "#e4e4e7", margin: "24px 0" }} />
      <Text style={sign}>Kind regards,<br />{senderName}</Text>
    </EmailLayout>
  )
}

const greet:       React.CSSProperties = { fontSize: 14, color: "#3f3f46", margin: "0 0 8px" }
const h1:          React.CSSProperties = { fontSize: 20, fontWeight: 700, color: "#18181b", margin: "0 0 16px" }
const para:        React.CSSProperties = { fontSize: 14, color: "#3f3f46", lineHeight: "1.6", margin: "0 0 16px" }
const box:         React.CSSProperties = { background: "#f4f4f5", borderRadius: 6, padding: "12px 16px", margin: "0 0 16px" }
const sectionHead: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: "#71717a", textTransform: "uppercase", letterSpacing: "0.05em", margin: "0 0 8px" }
const boxRow:      React.CSSProperties = { fontSize: 13, color: "#3f3f46", margin: "4px 0" }
const sign:        React.CSSProperties = { fontSize: 14, color: "#3f3f46", margin: "0" }
