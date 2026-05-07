/**
 * lib/comms/templates/agent/subscriptions/dormancy-final.tsx — Final 24-hour dormancy close warning
 *
 * Auth:   agent-facing; sent to org owner / accountant only
 * Data:   props injected at send time — no DB access
 * Notes:  Triggered 1 day before automatic dormancy close. Free Owner tier — no payment needed,
 *         just a login stops the closure entirely.
 */

import * as React from "react"
import { Section, Text } from "@react-email/components"
import { EmailLayout, EmailButton, type OrgBranding } from "../../layout"

export const DORMANCY_FINAL_SUBJECT = "Last notice: your Pleks account closes tomorrow"

export interface DormancyFinalEmailProps {
  branding: OrgBranding
  orgName: string
  recipientName: string
  appUrl: string
  scheduledCloseDate: string
}

export function DormancyFinalEmail({
  branding,
  orgName,
  recipientName,
  appUrl,
  scheduledCloseDate,
}: Readonly<DormancyFinalEmailProps>) {
  const preview = `Last notice: your ${orgName} account is scheduled to close tomorrow (${scheduledCloseDate}). Log in today to stop this.`
  return (
    <EmailLayout preview={preview} branding={branding}>
      <Text style={h1}>Account closes tomorrow</Text>

      <Text style={para}>Hi {recipientName},</Text>

      <Text style={para}>
        Tomorrow — <strong>{scheduledCloseDate}</strong> — your <strong>{orgName}</strong> Pleks
        account will be automatically closed and all data deleted due to extended inactivity.
      </Text>

      <Section style={box}>
        <Text style={boxRow}>
          Logging in today will stop this completely. No form to fill in, no payment required
          — you&apos;re on the free Owner tier. Just log in and the scheduled closure is cancelled
          immediately.
        </Text>
      </Section>

      <EmailButton
        href={`${appUrl}/login`}
        accentColor={branding.accentColor}
      >
        Log in now to keep your account
      </EmailButton>
    </EmailLayout>
  )
}

const h1 = { fontSize: 20, fontWeight: 700, color: "#18181b", margin: "0 0 16px" }
const para = { fontSize: 15, color: "#3f3f46", lineHeight: "24px", margin: "0 0 16px" }
const box = { backgroundColor: "#f4f4f5", borderRadius: 6, padding: "12px 16px", margin: "16px 0" }
const boxRow = { fontSize: 13, color: "#3f3f46", margin: "0 0 4px" }
