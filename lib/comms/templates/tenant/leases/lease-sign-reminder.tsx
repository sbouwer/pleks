/**
 * lib/comms/templates/tenant/leases/lease-sign-reminder.tsx — unsigned lease reminder (L2)
 *
 * Data:   tenant name, property label, days unsigned, optional signing link, org branding
 * Notes:  Fires T+3 days after lease sent (status = pending_signing). BUILD_63 Phase 5 cron.
 */

import * as React from "react"
import { Text, Button, Hr } from "@react-email/components"
import { EmailLayout, type OrgBranding } from "../../layout"

export interface LeaseSignReminderEmailProps {
  branding: OrgBranding
  tenantName: string
  propertyLabel: string
  daysUnsigned: number
  signingUrl?: string
  senderName: string
}

export function LeaseSignReminderEmail({
  branding,
  tenantName,
  propertyLabel,
  daysUnsigned,
  signingUrl,
  senderName,
}: Readonly<LeaseSignReminderEmailProps>) {
  const preview = `Reminder: your lease for ${propertyLabel} is still waiting for your signature`

  return (
    <EmailLayout preview={preview} branding={branding}>
      <Text style={greet}>Dear {tenantName},</Text>

      <Text style={h1}>Friendly reminder — lease awaiting signature</Text>

      <Text style={para}>
        Your lease agreement for <strong>{propertyLabel}</strong> was sent {daysUnsigned} day{daysUnsigned !== 1 ? "s" : ""} ago
        and is still waiting for your signature. Please sign at your earliest convenience so we
        can get everything in order before your move-in date.
      </Text>

      {signingUrl && (
        <Button href={signingUrl} style={cta}>Sign Lease Now</Button>
      )}

      {!signingUrl && (
        <Text style={para}>
          Please contact {branding.orgEmail ?? senderName} if you have any questions or need
          assistance signing your lease.
        </Text>
      )}

      <Hr style={{ borderColor: "#e4e4e7", margin: "24px 0" }} />
      <Text style={sign}>Kind regards,<br />{senderName}</Text>
    </EmailLayout>
  )
}

export function buildLeaseSignReminderSms(
  firstName: string,
  propertyLabel: string,
  senderName: string,
): string {
  return `${senderName}: Reminder - your lease for ${propertyLabel} is still waiting for your signature. Please check your email to sign.`
}

const greet: React.CSSProperties = { fontSize: 14, color: "#3f3f46", margin: "0 0 8px" }
const h1:    React.CSSProperties = { fontSize: 20, fontWeight: 700, color: "#18181b", margin: "0 0 16px" }
const para:  React.CSSProperties = { fontSize: 14, color: "#3f3f46", lineHeight: "1.6", margin: "0 0 16px" }
const cta:   React.CSSProperties = { background: "#18181b", color: "#ffffff", fontSize: 14, fontWeight: 600, padding: "12px 28px", borderRadius: 6, textDecoration: "none", display: "inline-block", margin: "0 0 16px" }
const sign:  React.CSSProperties = { fontSize: 14, color: "#3f3f46", margin: "0" }
