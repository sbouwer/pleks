/**
 * lib/comms/templates/agent/subscriptions/resumed.tsx — Subscription reactivation confirmation
 *
 * Auth:   agent-facing; sent to org owner / accountant only
 * Data:   props injected at send time — no DB access
 * Notes:  Positive email — no subscription alert footer needed.
 *         Sent on both successful payment retry and manual resume.
 */

import * as React from "react"
import { Text } from "@react-email/components"
import { EmailLayout, EmailButton, type OrgBranding } from "../../layout"

export const RESUMED_SUBJECT = "You're back — subscription reactivated"

export interface ResumedEmailProps {
  branding: OrgBranding
  orgName: string
  recipientName: string
  appUrl: string
}

export function ResumedEmail({
  branding,
  orgName,
  recipientName,
  appUrl,
}: Readonly<ResumedEmailProps>) {
  const preview = `Good news — the ${orgName} subscription is fully active again. All your data is exactly as you left it.`
  return (
    <EmailLayout preview={preview} branding={branding}>
      <Text style={h1}>All systems go — you&apos;re fully active again</Text>

      <Text style={para}>Hi {recipientName},</Text>

      <Text style={para}>
        Payment went through and your <strong>{orgName}</strong> subscription is fully active again.
        Full access has been restored — new leases, properties, applications, everything.
      </Text>

      <Text style={para}>
        All your data is exactly as you left it. Nothing has changed, nothing was lost.
      </Text>

      <EmailButton
        href={`${appUrl}/dashboard`}
        accentColor={branding.accentColor}
      >
        Go to dashboard
      </EmailButton>
    </EmailLayout>
  )
}

const h1 = { fontSize: 20, fontWeight: 700, color: "#18181b", margin: "0 0 16px" }
const para = { fontSize: 15, color: "#3f3f46", lineHeight: "24px", margin: "0 0 16px" }
