/**
 * lib/comms/templates/agent/subscriptions/past-due-day7.tsx — Day-7 payment failure reminder
 *
 * Auth:   agent-facing; sent to org owner / accountant only
 * Data:   props injected at send time — no DB access
 * Notes:  Second dunning email. Adds urgency — 7 more days until auto-pause.
 *         Workspace still fully active at this point.
 */

import * as React from "react"
import { Section, Text } from "@react-email/components"
import { EmailLayout, EmailButton, type OrgBranding } from "../../layout"

export const PAST_DUE_DAY7_SUBJECT = "Second reminder: payment for {{orgName}} still pending"

export interface PastDueDaySevenEmailProps {
  branding: OrgBranding
  orgName: string
  recipientName: string
  appUrl: string
  daysOverdue: number
}

export function PastDueDaySevenEmail({
  branding,
  orgName,
  recipientName,
  appUrl,
  daysOverdue,
}: Readonly<PastDueDaySevenEmailProps>) {
  const preview = `${orgName} payment still hasn't cleared after ${daysOverdue} days — action needed to avoid an automatic pause.`
  return (
    <EmailLayout
      preview={preview}
      branding={branding}
      footerVariant="past_due_warning"
      subscriptionAlert={{
        settingsUrl: `${appUrl}/settings/subscription`,
        cancelledDate: "",
        purgeEligibleAt: "",
        daysUntilPurge: 0,
        exportUrl: `${appUrl}/reports`,
      }}
    >
      <Text style={h1}>Payment still pending — one week on</Text>

      <Text style={para}>Hi {recipientName},</Text>

      <Text style={para}>
        It&apos;s been {daysOverdue} days since the payment for <strong>{orgName}</strong> first
        failed, and PayFast has retried but the payment still hasn&apos;t cleared.
      </Text>

      <Text style={para}>
        Your workspace is still fully active — all reads, reports and scheduled tenant communications
        are running normally, and nothing has been disrupted for your landlords or tenants.
      </Text>

      <Section style={box}>
        <Text style={boxRow} >
          <strong>Important:</strong> if payment doesn&apos;t clear in the next 7 days, your
          account will be paused automatically. Updating your payment details or contacting your
          bank now will prevent this.
        </Text>
      </Section>

      <EmailButton
        href={`${appUrl}/settings/subscription`}
        accentColor={branding.accentColor}
      >
        Settle payment now
      </EmailButton>

      <Text style={small}>
        Need help? Reply to this email and we&apos;ll sort it out with you.
      </Text>
    </EmailLayout>
  )
}

const h1 = { fontSize: 20, fontWeight: 700, color: "#18181b", margin: "0 0 16px" }
const para = { fontSize: 15, color: "#3f3f46", lineHeight: "24px", margin: "0 0 16px" }
const small = { fontSize: 12, color: "#71717a", margin: "0 0 8px" }
const box = { backgroundColor: "#fffbeb", borderRadius: 6, padding: "12px 16px", margin: "16px 0", border: "1px solid #fcd34d" }
const boxRow = { fontSize: 13, color: "#3f3f46", margin: "0 0 4px" }
