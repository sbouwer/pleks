/**
 * lib/comms/templates/portal/role-invites.tsx — branded landlord & supplier portal invites (ADDENDUM_70I)
 *
 * Data:   recipient name, portal action-link URL, org branding
 * Notes:  Mirrors PortalTenantInviteEmail. portalUrl is a Supabase auth.admin.generateLink({type:"invite"})
 *         action link — same provisioning as inviteUserByEmail, just wrapped in a branded EmailLayout
 *         instead of Supabase's generic email. Agency-branded (agent→landlord/supplier). TTL is the
 *         Supabase "Invite email token validity" global (copy says "a few days" to stay accurate).
 */

import * as React from "react"
import { Text, Button, Hr } from "@react-email/components"
import { EmailLayout, type OrgBranding } from "../layout"

export interface PortalRoleInviteEmailProps {
  branding: OrgBranding
  recipientName: string
  portalUrl: string
  /** sign-off name — the agency (branding.orgName) by default */
  senderName: string
}

function InviteShell({
  branding, recipientName, portalUrl, senderName, heading, intro, ignoreContact,
}: Readonly<PortalRoleInviteEmailProps & { heading: string; intro: string; ignoreContact: string }>) {
  return (
    <EmailLayout preview={heading} branding={branding}>
      <Text style={greet}>Dear {recipientName},</Text>
      <Text style={h1}>{heading}</Text>
      <Text style={para}>{intro}</Text>
      <Text style={para}>Click the button below to set up your account. The link will expire after a few days.</Text>
      <Button href={portalUrl} style={cta}>Set Up My Account</Button>
      <Text style={para}>{ignoreContact} If you have any questions, contact {branding.orgEmail ?? senderName}.</Text>
      <Hr style={{ borderColor: "#e4e4e7", margin: "24px 0" }} />
      <Text style={sign}>Kind regards,<br />{senderName}</Text>
    </EmailLayout>
  )
}

export function PortalLandlordInviteEmail(props: Readonly<PortalRoleInviteEmailProps>) {
  return (
    <InviteShell
      {...props}
      heading="Your owner portal is ready"
      intro="We've set up a secure online portal where you can view your monthly statements, track income and expenses across your properties, and follow what's happening with your tenancies — all in one place."
      ignoreContact="If you did not expect this invitation, you can safely ignore this email."
    />
  )
}

export function PortalSupplierInviteEmail(props: Readonly<PortalRoleInviteEmailProps>) {
  return (
    <InviteShell
      {...props}
      heading="Your supplier portal is ready"
      intro="We've set up a secure online portal where you can view the jobs assigned to you, submit quotes and invoices, and track the status of your work — all in one place."
      ignoreContact="If you did not expect this invitation, you can safely ignore this email."
    />
  )
}

const greet: React.CSSProperties = { fontSize: 14, color: "#3f3f46", margin: "0 0 8px" }
const h1:    React.CSSProperties = { fontSize: 20, fontWeight: 700, color: "#18181b", margin: "0 0 16px" }
const para:  React.CSSProperties = { fontSize: 14, color: "#3f3f46", lineHeight: "1.6", margin: "0 0 16px" }
const cta:   React.CSSProperties = { background: "#18181b", color: "#ffffff", fontSize: 14, fontWeight: 600, padding: "12px 28px", borderRadius: 6, textDecoration: "none", display: "inline-block", margin: "0 0 16px" }
const sign:  React.CSSProperties = { fontSize: 14, color: "#3f3f46", margin: "0" }
