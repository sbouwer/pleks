/**
 * lib/comms/templates/agent/subscriptions/past-due-first.tsx — Day-0 payment failure notice
 *
 * Auth:   agent-facing; sent to org owner / accountant only
 * Data:   props injected at send time — no DB access
 * Notes:  First dunning email. Reassuring tone — no action required yet.
 *         PayFast retry logic handles recovery; this email is informational only.
 */

import * as React from "react"
import { Section, Text } from "@react-email/components"
import { EmailLayout, EmailButton, type OrgBranding } from "../../layout"

export const PAST_DUE_FIRST_SUBJECT = "Payment for {{orgName}} didn't go through"

export interface PastDueFirstEmailProps {
  branding: OrgBranding
  orgName: string
  recipientName: string
  appUrl: string
}

export function PastDueFirstEmail({
  branding,
  orgName,
  recipientName,
  appUrl,
}: Readonly<PastDueFirstEmailProps>) {
  const preview = `Hi ${recipientName}, we couldn't process the latest payment for ${orgName} — PayFast will retry automatically.`
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
      <Text style={h1}>We couldn&apos;t process your payment</Text>

      <Text style={para}>Hi {recipientName},</Text>

      <Text style={para}>
        The latest payment for <strong>{orgName}</strong> didn&apos;t go through on PayFast. No
        action is required right now — PayFast will automatically retry over the next few days.
      </Text>

      <Text style={para}>
        In the meantime, everything in your Pleks workspace is running as normal. Your properties,
        leases, tenants and all scheduled communications are completely unaffected.
      </Text>

      <Section style={box}>
        <Text style={boxRow}>
          If you&apos;d like to update your card details or check your payment method, you can do
          that at any time in Settings → Subscription.
        </Text>
      </Section>

      <EmailButton
        href={`${appUrl}/settings/subscription`}
        accentColor={branding.accentColor}
      >
        Update payment details
      </EmailButton>

      <Text style={small}>
        If payment succeeds in the next few days, you won&apos;t hear from us again.
      </Text>
    </EmailLayout>
  )
}

const h1 = { fontSize: 20, fontWeight: 700, color: "#18181b", margin: "0 0 16px" }
const para = { fontSize: 15, color: "#3f3f46", lineHeight: "24px", margin: "0 0 16px" }
const small = { fontSize: 12, color: "#71717a", margin: "0 0 8px" }
const box = { backgroundColor: "#f4f4f5", borderRadius: 6, padding: "12px 16px", margin: "16px 0" }
const boxRow = { fontSize: 13, color: "#3f3f46", margin: "0 0 4px" }
