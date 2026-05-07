/**
 * lib/comms/templates/agent/subscriptions/paused-manual.tsx — Manual subscription pause confirmation
 *
 * Auth:   agent-facing; sent to org owner / accountant only
 * Data:   props injected at send time — no DB access
 * Notes:  Triggered when agent deliberately pauses from Settings.
 *         Acknowledges intent; same feature breakdown as auto-pause.
 */

import * as React from "react"
import { Section, Text } from "@react-email/components"
import { EmailLayout, EmailButton, type OrgBranding } from "../../layout"

export const PAUSED_MANUAL_SUBJECT = "Your subscription is now paused"

export interface PausedManualEmailProps {
  branding: OrgBranding
  orgName: string
  recipientName: string
  appUrl: string
  pausedDate: string
}

export function PausedManualEmail({
  branding,
  orgName,
  recipientName,
  appUrl,
  pausedDate,
}: Readonly<PausedManualEmailProps>) {
  const preview = `You've paused the ${orgName} subscription. Your data is safe and you can resume any time from Settings.`
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
      <Text style={h1}>You&apos;ve paused your subscription</Text>

      <Text style={para}>Hi {recipientName},</Text>

      <Text style={para}>
        You&apos;ve paused the <strong>{orgName}</strong> subscription on{" "}
        <strong>{pausedDate}</strong>. Everything you&apos;ve built in Pleks is safe and waiting for
        you.
      </Text>

      <Section style={box}>
        <Text style={boxLabel}>Still available while paused</Text>
        <Text style={boxRow}>All existing property, lease and tenant data</Text>
        <Text style={boxRow}>Financial reports and exports</Text>
        <Text style={boxRow}>Scheduled tenant and landlord notifications</Text>
      </Section>

      <Section style={boxMuted}>
        <Text style={boxLabel}>Available again when you resume</Text>
        <Text style={boxRow}>Creating new leases</Text>
        <Text style={boxRow}>Onboarding new properties</Text>
        <Text style={boxRow}>Processing new rental applications</Text>
      </Section>

      <Text style={para}>
        You can resume your subscription at any time from Settings — it only takes a moment and
        everything will pick up exactly where you left off.
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
