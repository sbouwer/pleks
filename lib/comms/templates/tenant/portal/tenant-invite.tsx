/**
 * lib/comms/templates/tenant/portal/tenant-invite.tsx — tenant portal auto-invite (P1)
 *
 * Data:   tenant name, portal magic-link URL, org branding
 * Notes:  Fires on lease activation via activateLeaseCascade. portalUrl is a Supabase
 *         auth.admin.generateLink invite link — time-limited (24h). BUILD_63 Phase 5.
 */

import * as React from "react"
import { Text, Button, Hr } from "@react-email/components"
import { EmailLayout, type OrgBranding } from "../../layout"

export interface PortalTenantInviteEmailProps {
  branding: OrgBranding
  tenantName: string
  portalUrl: string
  senderName: string
}

export function PortalTenantInviteEmail({
  branding,
  tenantName,
  portalUrl,
  senderName,
}: Readonly<PortalTenantInviteEmailProps>) {
  const preview = `Set up your tenant portal account — manage your lease, payments, and maintenance online`

  return (
    <EmailLayout preview={preview} branding={branding}>
      <Text style={greet}>Dear {tenantName},</Text>

      <Text style={h1}>Your tenant portal is ready</Text>

      <Text style={para}>
        Your lease is now active. We have set up a secure online portal where you can view your
        lease documents, track payment history, and log maintenance requests — all in one place.
      </Text>

      <Text style={para}>
        Click the button below to set up your account. This link is valid for 24 hours.
      </Text>

      <Button href={portalUrl} style={cta}>Set Up My Account</Button>

      <Text style={para}>
        If you did not expect this invitation, you can safely ignore this email. If you have any
        questions, contact {branding.orgEmail ?? senderName}.
      </Text>

      <Hr style={{ borderColor: "#e4e4e7", margin: "24px 0" }} />
      <Text style={sign}>Kind regards,<br />{senderName}</Text>
    </EmailLayout>
  )
}

const greet: React.CSSProperties = { fontSize: 14, color: "#3f3f46", margin: "0 0 8px" }
const h1:    React.CSSProperties = { fontSize: 20, fontWeight: 700, color: "#18181b", margin: "0 0 16px" }
const para:  React.CSSProperties = { fontSize: 14, color: "#3f3f46", lineHeight: "1.6", margin: "0 0 16px" }
const cta:   React.CSSProperties = { background: "#18181b", color: "#ffffff", fontSize: 14, fontWeight: 600, padding: "12px 28px", borderRadius: 6, textDecoration: "none", display: "inline-block", margin: "0 0 16px" }
const sign:  React.CSSProperties = { fontSize: 14, color: "#3f3f46", margin: "0" }
