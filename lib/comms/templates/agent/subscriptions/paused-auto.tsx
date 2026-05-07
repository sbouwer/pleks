/**
 * lib/comms/templates/agent/subscriptions/paused-auto.tsx — Automatic subscription pause notice
 *
 * Auth:   agent-facing; sent to org owner / accountant only
 * Data:   props injected at send time — no DB access
 * Notes:  Sent when the system auto-pauses after 14 days of failed retries.
 *         Clearly lists what is and isn't available while paused.
 */

import * as React from "react"
import { Section, Text } from "@react-email/components"
import { EmailLayout, EmailButton, type OrgBranding } from "../../layout"

export const PAUSED_AUTO_SUBJECT = "Your Pleks subscription has been paused"

export interface PausedAutoEmailProps {
  branding: OrgBranding
  orgName: string
  recipientName: string
  appUrl: string
  pausedDate: string
}

export function PausedAutoEmail({
  branding,
  orgName,
  recipientName,
  appUrl,
  pausedDate,
}: Readonly<PausedAutoEmailProps>) {
  const preview = `The ${orgName} subscription was paused on ${pausedDate} after two weeks of unsuccessful payment retries.`
  return (
    <EmailLayout
      preview={preview}
      branding={branding}
      footerVariant="paused_resume_cta"
      subscriptionAlert={{
        settingsUrl: `${appUrl}/settings/subscription`,
        cancelledDate: "",
        purgeEligibleAt: "",
        daysUntilPurge: 0,
        exportUrl: `${appUrl}/reports`,
      }}
    >
      <Text style={h1}>Your subscription has been paused</Text>

      <Text style={para}>Hi {recipientName},</Text>

      <Text style={para}>
        After two weeks of unsuccessful payment retries, the <strong>{orgName}</strong> subscription
        was automatically paused on <strong>{pausedDate}</strong>.
      </Text>

      <Section style={box}>
        <Text style={boxLabel}>Still available</Text>
        <Text style={boxRow}>All existing property, lease and tenant data</Text>
        <Text style={boxRow}>Financial reports and exports</Text>
        <Text style={boxRow}>Scheduled tenant and landlord notifications</Text>
      </Section>

      <Section style={boxMuted}>
        <Text style={boxLabel}>Paused until payment is settled</Text>
        <Text style={boxRow}>Creating new leases</Text>
        <Text style={boxRow}>Onboarding new properties</Text>
        <Text style={boxRow}>Processing new rental applications</Text>
      </Section>

      <Text style={para}>
        Settling the overdue payment will restore full access instantly — no further steps needed.
      </Text>

      <EmailButton
        href={`${appUrl}/settings/subscription`}
        accentColor={branding.accentColor}
      >
        Resume subscription
      </EmailButton>
    </EmailLayout>
  )
}

const h1 = { fontSize: 20, fontWeight: 700, color: "#18181b", margin: "0 0 16px" }
const para = { fontSize: 15, color: "#3f3f46", lineHeight: "24px", margin: "0 0 16px" }
const box = { backgroundColor: "#f0fdf4", borderRadius: 6, padding: "12px 16px", margin: "16px 0", border: "1px solid #86efac" }
const boxMuted = { backgroundColor: "#f4f4f5", borderRadius: 6, padding: "12px 16px", margin: "16px 0" }
const boxLabel = { fontSize: 11, fontWeight: 700, color: "#71717a", textTransform: "uppercase" as const, letterSpacing: 1, margin: "0 0 6px" }
const boxRow = { fontSize: 13, color: "#3f3f46", margin: "0 0 4px" }
