/**
 * lib/comms/templates/agent/subscriptions/dormancy-warning.tsx — 60-day inactivity check-in
 *
 * Auth:   agent-facing; sent to org owner / accountant only
 * Data:   props injected at send time — no DB access
 * Notes:  Applies to Owner-free (free-tier) accounts only. Friendly tone — no subscription
 *         state involved. Just logging in resets the dormancy clock.
 */

import * as React from "react"
import { Section, Text } from "@react-email/components"
import { EmailLayout, EmailButton, type OrgBranding } from "../../layout"

export const DORMANCY_WARNING_SUBJECT = "Your Pleks account hasn't been used — a quick check-in"

export interface DormancyWarningEmailProps {
  branding: OrgBranding
  orgName: string
  recipientName: string
  appUrl: string
  daysInactive: number
  scheduledCloseDate: string
}

export function DormancyWarningEmail({
  branding,
  orgName,
  recipientName,
  appUrl,
  daysInactive,
  scheduledCloseDate,
}: Readonly<DormancyWarningEmailProps>) {
  const preview = `Your ${orgName} account has been inactive for ${daysInactive} days. Log in to keep your data safe.`
  return (
    <EmailLayout preview={preview} branding={branding}>
      <Text style={h1}>Checking in on your account</Text>

      <Text style={para}>Hi {recipientName},</Text>

      <Text style={para}>
        Your <strong>{orgName}</strong> Pleks account hasn&apos;t been active for{" "}
        <strong>{daysInactive} days</strong>. That&apos;s completely fine — everything is still
        here. Your properties, leases and contacts are all safe and waiting for you.
      </Text>

      <Section style={box}>
        <Text style={boxRow}>
          Owner-free accounts that remain completely inactive are automatically closed after a
          period of inactivity, but you have <strong>30 days</strong> before that happens. The
          scheduled close date is <strong>{scheduledCloseDate}</strong>.
        </Text>
        <Text style={{ ...boxRow, marginTop: 8 }}>
          Simply logging in resets the clock — no forms, no payments, nothing else required.
        </Text>
      </Section>

      <EmailButton
        href={`${appUrl}/login`}
        accentColor={branding.accentColor}
      >
        Log in to keep your account
      </EmailButton>
    </EmailLayout>
  )
}

const h1 = { fontSize: 20, fontWeight: 700, color: "#18181b", margin: "0 0 16px" }
const para = { fontSize: 15, color: "#3f3f46", lineHeight: "24px", margin: "0 0 16px" }
const box = { backgroundColor: "#f4f4f5", borderRadius: 6, padding: "12px 16px", margin: "16px 0" }
const boxRow = { fontSize: 13, color: "#3f3f46", margin: "0 0 4px" }
